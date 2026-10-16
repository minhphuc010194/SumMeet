import Foundation
import CoreAudio
import AudioToolbox

// Native macOS 14.2+ CoreAudio Global System Audio Tap Recorder
// Captures all system audio (YouTube, Chrome, Safari, Zoom, Meet, QuickTime, AirPods/Speakers)
// directly into a live-readable 16-bit PCM Mono WAV file without any screen-sharing popup.

var shouldStop = false

signal(SIGTERM) { _ in shouldStop = true }
signal(SIGINT) { _ in shouldStop = true }

func writeWavHeader(fd: Int32, sampleRate: UInt32, dataBytes: UInt32) {
    var header = Data(capacity: 44)
    let channels: UInt16 = 1
    let bitsPerSample: UInt16 = 16
    let byteRate: UInt32 = sampleRate * UInt32(channels) * UInt32(bitsPerSample / 8)
    let blockAlign: UInt16 = channels * (bitsPerSample / 8)
    let riffChunkSize: UInt32 = 36 + dataBytes

    header.append("RIFF".data(using: .ascii)!)
    withUnsafeBytes(of: riffChunkSize.littleEndian) { header.append(contentsOf: $0) }
    header.append("WAVE".data(using: .ascii)!)
    header.append("fmt ".data(using: .ascii)!)
    let fmtChunkSize: UInt32 = 16
    let audioFormat: UInt16 = 1 // PCM
    withUnsafeBytes(of: fmtChunkSize.littleEndian) { header.append(contentsOf: $0) }
    withUnsafeBytes(of: audioFormat.littleEndian) { header.append(contentsOf: $0) }
    withUnsafeBytes(of: channels.littleEndian) { header.append(contentsOf: $0) }
    withUnsafeBytes(of: sampleRate.littleEndian) { header.append(contentsOf: $0) }
    withUnsafeBytes(of: byteRate.littleEndian) { header.append(contentsOf: $0) }
    withUnsafeBytes(of: blockAlign.littleEndian) { header.append(contentsOf: $0) }
    withUnsafeBytes(of: bitsPerSample.littleEndian) { header.append(contentsOf: $0) }
    header.append("data".data(using: .ascii)!)
    withUnsafeBytes(of: dataBytes.littleEndian) { header.append(contentsOf: $0) }

    header.withUnsafeBytes { rawBuf in
        if let base = rawBuf.baseAddress {
            _ = pwrite(fd, base, 44, 0)
        }
    }
}

@available(macOS 14.2, *)
func runSystemAudioTap(outputPath: String) -> Int32 {
    let levelPath = outputPath + ".level"
    let fd = open(outputPath, O_CREAT | O_TRUNC | O_RDWR, 0o644)
    if fd < 0 {
        fputs("Failed to open output WAV file: \(outputPath)\n", stderr)
        return 1
    }
    defer { close(fd) }

    let tapDesc = CATapDescription(monoGlobalTapButExcludeProcesses: [])
    tapDesc.uuid = UUID()
    tapDesc.name = "SummarizeBotGlobalAudioTap"

    var tapID: AudioObjectID = AudioObjectID(kAudioObjectUnknown)
    let errTap = AudioHardwareCreateProcessTap(tapDesc, &tapID)
    guard errTap == noErr else {
        fputs("AudioHardwareCreateProcessTap failed: \(errTap)\n", stderr)
        return 2
    }
    defer { AudioHardwareDestroyProcessTap(tapID) }

    let aggUID = UUID().uuidString
    let aggDict: [String: Any] = [
        kAudioAggregateDeviceNameKey: "SummarizeBotTapAggDevice",
        kAudioAggregateDeviceUIDKey: aggUID,
        kAudioAggregateDeviceIsPrivateKey: true,
        kAudioAggregateDeviceTapListKey: [
            [
                kAudioSubTapUIDKey: tapDesc.uuid.uuidString,
                kAudioSubTapDriftCompensationKey: true
            ]
        ],
        kAudioAggregateDeviceTapAutoStartKey: true
    ]

    var aggDeviceID: AudioObjectID = AudioObjectID(kAudioObjectUnknown)
    let errAgg = AudioHardwareCreateAggregateDevice(aggDict as CFDictionary, &aggDeviceID)
    guard errAgg == noErr else {
        fputs("AudioHardwareCreateAggregateDevice failed: \(errAgg)\n", stderr)
        return 3
    }
    defer { AudioHardwareDestroyAggregateDevice(aggDeviceID) }

    var asbd = AudioStreamBasicDescription()
    var propSize = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
    var propAddr = AudioObjectPropertyAddress(
        mSelector: kAudioTapPropertyFormat,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    AudioObjectGetPropertyData(tapID, &propAddr, 0, nil, &propSize, &asbd)
    let sampleRate = UInt32(asbd.mSampleRate > 0 ? asbd.mSampleRate : 48000)

    writeWavHeader(fd: fd, sampleRate: sampleRate, dataBytes: 0)
    var totalDataBytes: UInt32 = 0
    var currentFileOffset: off_t = 44
    var latestRms: Float = 0.0
    let writeLock = NSLock()

    var ioProcID: AudioDeviceIOProcID?
    let errIO = AudioDeviceCreateIOProcIDWithBlock(&ioProcID, aggDeviceID, DispatchQueue.global(qos: .userInteractive)) { _, inInputData, _, _, _ in
        let bufList = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: inInputData))
        for buf in bufList {
            guard let data = buf.mData else { continue }
            let floatCount = Int(buf.mDataByteSize) / MemoryLayout<Float>.size
            if floatCount <= 0 { continue }
            let ptr = data.bindMemory(to: Float.self, capacity: floatCount)

            var pcm16 = [Int16](repeating: 0, count: floatCount)
            var sumSq: Float = 0
            for i in 0..<floatCount {
                let sample = max(-1.0, min(1.0, ptr[i]))
                sumSq += sample * sample
                pcm16[i] = Int16(sample * 32767.0)
            }
            let rms = min(1.0, sqrt(sumSq / Float(floatCount)) * 3.0)

            let byteCount = floatCount * MemoryLayout<Int16>.size
            writeLock.lock()
            latestRms = rms
            pcm16.withUnsafeBytes { rawBytes in
                if let base = rawBytes.baseAddress {
                    _ = pwrite(fd, base, byteCount, currentFileOffset)
                    currentFileOffset += off_t(byteCount)
                    totalDataBytes += UInt32(byteCount)
                }
            }
            writeLock.unlock()
        }
    }

    guard errIO == noErr, let procID = ioProcID else {
        fputs("AudioDeviceCreateIOProcIDWithBlock failed: \(errIO)\n", stderr)
        return 4
    }
    defer { AudioDeviceDestroyIOProcID(aggDeviceID, procID) }

    let errStart = AudioDeviceStart(aggDeviceID, procID)
    guard errStart == noErr else {
        fputs("AudioDeviceStart failed: \(errStart)\n", stderr)
        return 5
    }
    defer { AudioDeviceStop(aggDeviceID, procID) }

    // Periodically flush WAV header size + RMS level file so live chunks can be read anytime
    while !shouldStop {
        Thread.sleep(forTimeInterval: 0.25)
        writeLock.lock()
        let bytesNow = totalDataBytes
        let rmsNow = latestRms
        writeWavHeader(fd: fd, sampleRate: sampleRate, dataBytes: bytesNow)
        writeLock.unlock()

        let levelStr = String(format: "%.4f", rmsNow)
        try? levelStr.write(toFile: levelPath, atomically: true, encoding: .utf8)
    }

    writeLock.lock()
    writeWavHeader(fd: fd, sampleRate: sampleRate, dataBytes: totalDataBytes)
    writeLock.unlock()
    fsync(fd)
    try? "0.0000".write(toFile: levelPath, atomically: true, encoding: .utf8)
    return 0
}

let args = CommandLine.arguments
if args.count < 2 {
    fputs("Usage: macos-system-tap <output_wav_path>\n", stderr)
    exit(1)
}

if #available(macOS 14.2, *) {
    let code = runSystemAudioTap(outputPath: args[1])
    exit(code)
} else {
    fputs("macOS 14.2+ required for CATapDescription\n", stderr)
    exit(1)
}
