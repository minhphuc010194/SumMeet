import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarAndExportModal } from "@/components/integrations/CalendarAndExportModal";
import { getDictionary } from "@/i18n/dictionaries";
import { useMeetingStore } from "@/store/meeting-store";
import type { CalendarMeetingEvent } from "@/types/meeting";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const EVENT: CalendarMeetingEvent = {
  id: "evt-1",
  title: "Sprint planning",
  startTime: "09:00",
  endTime: "10:00",
  platform: "Zoom",
  participants: ["Ann", "Bob"],
};

describe("Recording a calendar meeting", () => {
  beforeEach(() => {
    localStorage.clear();
    useMeetingStore.setState({
      meetings: [],
      selectedMeetingId: "",
      calendarEvents: [EVENT],
    });
  });

  it.each(["vi", "en"] as const)(
    "creates the session in the %s locale",
    (locale) => {
      const dict = getDictionary(locale);
      const { createMeetingSession } = useMeetingStore.getState();
      const meeting = createMeetingSession({
        title: "Placeholder",
        audioDeviceUsed: "Mic",
        isHeadphoneSession: false,
        locale,
      });
      useMeetingStore.setState({ meetings: [] });
      const onClose = vi.fn();
      const onToast = vi.fn();

      render(
        <CalendarAndExportModal
          mode="calendar"
          onClose={onClose}
          meeting={meeting}
          dict={dict}
          onToast={onToast}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: dict.calendar.recordThisMeeting })
      );

      const [created] = useMeetingStore.getState().meetings;
      expect(created).toMatchObject({
        title: EVENT.title,
        calendarEventId: EVENT.id,
        participants: EVENT.participants,
      });
      expect(created.summary.overview).toBe(dict.session.liveOverview);
      expect(created.summary.providerUsed).toBe(dict.session.liveProvider);
      expect(created.summary.keywords).toEqual([
        dict.session.liveKeyword,
        dict.session.headphoneKeyword,
      ]);
      expect(created.audioDeviceUsed).toBe(dict.calendar.sessionDevice);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onToast).toHaveBeenCalledWith(
        dict.calendar.sessionCreatedToast.replace("{title}", EVENT.title)
      );
    }
  );

  it.each(["vi", "en"] as const)(
    "syncs the calendar feed with %s text",
    (locale) => {
      const dict = getDictionary(locale);
      const { createMeetingSession } = useMeetingStore.getState();
      const meeting = createMeetingSession({
        title: "Placeholder",
        audioDeviceUsed: "Mic",
        isHeadphoneSession: false,
        locale,
      });
      const onToast = vi.fn();

      render(
        <CalendarAndExportModal
          mode="calendar"
          onClose={vi.fn()}
          meeting={meeting}
          dict={dict}
          onToast={onToast}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: dict.calendar.syncButton })
      );

      const synced = useMeetingStore.getState().calendarEvents[0];
      expect(synced).toMatchObject({
        title: dict.calendar.syncedEventTitle,
        startTime: dict.calendar.syncedEventStart,
        participants: dict.calendar.syncedEventParticipants,
      });
      expect(onToast).toHaveBeenCalledWith(dict.calendar.syncedToast);
    }
  );
});
