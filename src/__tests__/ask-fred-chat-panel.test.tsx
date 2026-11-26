import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AskFredChatPanel } from "@/components/meeting/AskFredChatPanel";
import { getDictionary } from "@/i18n/dictionaries";
import { answerMeetingQuestion } from "@/services/ai/provider-registry";
import { useMeetingStore } from "@/store/meeting-store";
import type { ChatMessage } from "@/types/meeting";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
vi.mock("@/services/ai/provider-registry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/ai/provider-registry")>()),
  answerMeetingQuestion: vi.fn(),
}));

const chatMock = vi.mocked(answerMeetingQuestion);
const dict = getDictionary("en");
const OFFSET_TOP = 240;
const VIEWPORT_HEIGHT = 400;
const TYPED_QUESTION = "Who owns the audio filter?";

type ChatResult = Awaited<ReturnType<typeof answerMeetingQuestion>>;

let viewportHeight = VIEWPORT_HEIGHT;
let resizeTarget: Element | undefined;
let triggerResize = () => {};

function Harness({ meetingId }: { meetingId: string }) {
  const meeting = useMeetingStore((state) =>
    state.meetings.find((m) => m.id === meetingId)
  )!;
  return (
    <AskFredChatPanel
      meeting={meeting}
      dict={dict}
      locale="en"
      onToast={vi.fn()}
    />
  );
}

function seedMeeting(
  title: string,
  chat: Array<[ChatMessage["role"], string]>
): string {
  const meeting = useMeetingStore.getState().createMeetingSession({
    id: `mtg-${title}`,
    title,
    audioDeviceUsed: "Mic",
    isHeadphoneSession: false,
    locale: "en",
  });
  chat.forEach(([role, content]) =>
    useMeetingStore.getState().appendChatMessage(meeting.id, {
      id: `${meeting.id}-${role}-${content}`,
      meetingId: meeting.id,
      role,
      content,
      createdAt: "2026-10-16T00:00:00Z",
    })
  );
  return meeting.id;
}

function messagesViewport(anchorText: string): HTMLElement {
  return screen.getByText(anchorText).closest(".overflow-y-auto") as HTMLElement;
}

function latestTurn(viewport: HTMLElement): HTMLElement {
  return viewport.lastElementChild as HTMLElement;
}

function submitTypedQuestion(): string {
  fireEvent.change(screen.getByLabelText(dict.askFred.inputPlaceholder), {
    target: { value: TYPED_QUESTION },
  });
  fireEvent.click(screen.getByRole("button", { name: dict.askFred.sendButton }));
  return TYPED_QUESTION;
}

function submitSuggestedQuestion(): string {
  const question = dict.askFred.suggestedQuestions[0];
  fireEvent.click(screen.getByRole("button", { name: question }));
  return question;
}

describe("AskFredChatPanel assistant Markdown", () => {
  beforeEach(() => {
    localStorage.clear();
    useMeetingStore.setState({ meetings: [], selectedMeetingId: "" });
  });

  afterEach(cleanup);

  it("renders Markdown elements for an assistant answer", () => {
    const meetingId = seedMeeting("Markdown", [
      ["user", "Summarize"],
      [
        "assistant",
        [
          "### Decisions",
          "",
          "**Ship Friday** and *review* the `audio` path",
          "",
          "- first item",
          "  - nested item",
          "",
          "1. step one",
          "",
          "| Owner | Task |",
          "| --- | --- |",
          "| Nam | Filter |",
          "",
          "> quoted line",
          "",
          "---",
          "",
          "```",
          "const answer = 42;",
          "```",
        ].join("\n"),
      ],
    ]);

    const { container } = render(<Harness meetingId={meetingId} />);

    expect(
      screen.getByRole("heading", { level: 3, name: "Decisions" })
    ).toBeTruthy();
    expect(screen.getByText("Ship Friday").tagName).toBe("STRONG");
    expect(screen.getByText("review").tagName).toBe("EM");
    expect(screen.getByText("audio").tagName).toBe("CODE");
    expect(screen.getByText("first item").closest("li")).not.toBeNull();
    expect(container.querySelector("ul ul li")?.textContent).toBe("nested item");
    expect(container.querySelector("ol li")?.textContent).toBe("step one");
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Owner" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Filter" })).toBeTruthy();
    expect(container.querySelector("blockquote")?.textContent).toContain(
      "quoted line"
    );
    expect(container.querySelector("hr")).not.toBeNull();
    expect(container.querySelector("pre code")?.textContent).toContain(
      "const answer = 42;"
    );
  });

  it("does not render raw HTML as elements", () => {
    const meetingId = seedMeeting("Raw HTML", [
      ["user", "Question"],
      [
        "assistant",
        'Hello <b>raw bold</b> world <img src="https://evil.example/raw.png" onerror="alert(1)">\n\n<script>window.pwned = true</script>',
      ],
    ]);

    const { container } = render(<Harness meetingId={meetingId} />);

    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
  });

  it("does not render Markdown images", () => {
    const meetingId = seedMeeting("Images", [
      ["user", "Question"],
      [
        "assistant",
        "![tracker](https://evil.example/pixel.png?q=secret)\n\n![ref image][r]\n\n[r]: https://evil.example/ref.png",
      ],
    ]);

    const { container } = render(<Harness meetingId={meetingId} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[src]")).toBeNull();
  });

  it("renders links as text without an href", () => {
    const meetingId = seedMeeting("Links", [
      ["user", "Question"],
      [
        "assistant",
        "See [the docs](https://example.com/docs), [script link](javascript:alert(1)) and https://example.com/auto",
      ],
    ]);

    const { container } = render(<Harness meetingId={meetingId} />);

    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("[href]")).toBeNull();
    expect(screen.getByText(/the docs/)).toBeTruthy();
    expect(screen.getByText(/script link/)).toBeTruthy();
    expect(screen.getByText(/https:\/\/example\.com\/auto/)).toBeTruthy();
  });

  it("keeps user messages as plain text", () => {
    const meetingId = seedMeeting("Plain user", [
      ["user", "### Not a heading **raw** [link](https://example.com)"],
    ]);

    const { container } = render(<Harness meetingId={meetingId} />);

    expect(
      screen.getByText("### Not a heading **raw** [link](https://example.com)")
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Not a heading/ })).toBeNull();
    expect(container.querySelector("strong")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });
});

describe("AskFredChatPanel scroll pinning", () => {
  beforeEach(() => {
    localStorage.clear();
    chatMock.mockReset();
    useMeetingStore.setState({
      meetings: [],
      selectedMeetingId: "",
      openRouterKey: "sk-or-test-key",
    });
    vi.stubGlobal("fetch", vi.fn());
    viewportHeight = VIEWPORT_HEIGHT;
    resizeTarget = undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          triggerResize = callback;
        }
        observe(target: Element) {
          resizeTarget = target;
        }
        disconnect() {}
      }
    );
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(
      function (this: HTMLElement) {
        const isLatestTurn =
          this.parentElement?.classList.contains("overflow-y-auto") &&
          this === this.parentElement.lastElementChild;
        return isLatestTurn ? OFFSET_TOP : 0;
      }
    );
    vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(
      () => viewportHeight
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ["a typed question", submitTypedQuestion],
    ["a suggested question", submitSuggestedQuestion],
  ])(
    "pins %s at the top and does not re-scroll when the answer arrives",
    async (_, submit) => {
      let resolveAnswer!: (result: ChatResult) => void;
      chatMock.mockReturnValue(
        new Promise<ChatResult>((resolve) => {
          resolveAnswer = resolve;
        })
      );
      const meetingId = seedMeeting("Pinning", [
        ["user", "Earlier question"],
        ["assistant", "Earlier answer"],
      ]);
      render(<Harness meetingId={meetingId} />);
      const viewport = messagesViewport("Earlier question");
      viewport.scrollTop = 0;

      const question = submit();

      const turn = latestTurn(viewport);
      expect(viewport.scrollTop).toBe(OFFSET_TOP);
      expect(turn.style.minHeight).toBe(`${VIEWPORT_HEIGHT}px`);
      expect(within(turn).queryByText("Earlier question")).toBeNull();
      expect(
        within(turn.firstElementChild as HTMLElement).getByText(question)
      ).toBeTruthy();
      expect(
        within(turn.lastElementChild as HTMLElement).getByText(
          dict.askFred.thinking
        )
      ).toBeTruthy();

      viewport.scrollTop = 17;
      await act(async () => {
        resolveAnswer({
          success: true,
          data: {
            answer: "Short answer",
            providerUsed: "OpenRouter (test)",
            citations: [],
          },
        });
      });

      expect(within(turn).getByText("Short answer")).toBeTruthy();
      expect(screen.queryByText(dict.askFred.thinking)).toBeNull();
      expect(viewport.scrollTop).toBe(17);
      expect(turn.style.minHeight).toBe(`${VIEWPORT_HEIGHT}px`);
    }
  );

  it("pins the latest question on mount when the meeting already has history", () => {
    const meetingId = seedMeeting("History", [
      ["user", "First question"],
      ["assistant", "First answer"],
      ["user", "Second question"],
      ["assistant", "Second answer"],
    ]);

    render(<Harness meetingId={meetingId} />);

    const viewport = messagesViewport("Second question");
    const turn = latestTurn(viewport);
    expect(viewport.scrollTop).toBe(OFFSET_TOP);
    expect(turn.style.minHeight).toBe(`${VIEWPORT_HEIGHT}px`);
    expect(
      within(turn.firstElementChild as HTMLElement).getByText("Second question")
    ).toBeTruthy();
    expect(within(turn).getByText("Second answer")).toBeTruthy();
    expect(within(turn).queryByText("First question")).toBeNull();
  });

  it("pins the latest question again when the meeting changes", () => {
    const firstId = seedMeeting("First", [
      ["user", "First meeting question"],
      ["assistant", "First meeting answer"],
    ]);
    const secondId = seedMeeting("Second", [
      ["user", "Second meeting question"],
      ["assistant", "Second meeting answer"],
    ]);
    const { rerender } = render(<Harness meetingId={firstId} />);
    messagesViewport("First meeting question").scrollTop = 0;

    rerender(<Harness meetingId={secondId} />);

    const viewport = messagesViewport("Second meeting question");
    expect(viewport.scrollTop).toBe(OFFSET_TOP);
    expect(latestTurn(viewport).style.minHeight).toBe(`${VIEWPORT_HEIGHT}px`);
  });

  it("releases the reserved space when the history is cleared", () => {
    const meetingId = seedMeeting("Clear", [
      ["user", "Question to clear"],
      ["assistant", "Answer to clear"],
    ]);
    render(<Harness meetingId={meetingId} />);
    const viewport = messagesViewport("Question to clear");
    expect(latestTurn(viewport).style.minHeight).toBe(`${VIEWPORT_HEIGHT}px`);

    fireEvent.click(
      screen.getByRole("button", { name: dict.askFred.clearHistory })
    );

    expect(screen.queryByText("Question to clear")).toBeNull();
    expect(latestTurn(viewport).style.minHeight).toBe("");
  });

  it("disables scroll anchoring on the messages container", () => {
    const meetingId = seedMeeting("Anchoring", [
      ["user", "Anchored question"],
      ["assistant", "Anchored answer"],
    ]);

    render(<Harness meetingId={meetingId} />);

    expect(messagesViewport("Anchored question").className).toContain(
      "[overflow-anchor:none]"
    );
  });

  it("keeps the reserved space equal to the container height after a resize", () => {
    const meetingId = seedMeeting("Resize", [
      ["user", "Resized question"],
      ["assistant", "Resized answer"],
    ]);
    render(<Harness meetingId={meetingId} />);
    const viewport = messagesViewport("Resized question");
    viewport.scrollTop = 17;
    expect(resizeTarget).toBe(viewport);

    viewportHeight = 520;
    act(() => triggerResize());

    expect(latestTurn(viewport).style.minHeight).toBe("520px");
    expect(viewport.scrollTop).toBe(17);
  });
});
