import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LocaleHomePage, { generateStaticParams } from "@/app/[locale]/page";
import RootLayout from "@/app/layout";
import RootRedirectPage from "@/app/page";
import { getDictionary } from "@/i18n/dictionaries";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/components/onboarding/OpenRouterKeyGate", () => ({
  OpenRouterKeyGate: ({
    locale,
    children,
  }: {
    locale: string;
    children: React.ReactNode;
  }) => <div data-gate-locale={locale}>{children}</div>,
}));

vi.mock("@/components/dashboard/SumMeetWorkspace", () => ({
  SumMeetWorkspace: ({ locale }: { locale: string }) => (
    <div data-workspace-locale={locale} />
  ),
}));

describe("default locale", () => {
  it("redirects the root route to /en/", () => {
    replaceMock.mockReset();
    render(<RootRedirectPage />);
    expect(replaceMock).toHaveBeenCalledWith("/en/");
  });

  it("sets html lang to en on the root layout", () => {
    const element = RootLayout({ children: null });
    expect(element.props.lang).toBe("en");
  });

  it("falls back to en in LocaleHomePage and keeps vi when requested", async () => {
    expect(generateStaticParams()).toEqual([{ locale: "en" }, { locale: "vi" }]);

    const enTree = await LocaleHomePage({
      params: Promise.resolve({ locale: "unknown" }),
    });
    const { container: enContainer } = render(enTree);
    expect(
      enContainer.querySelector("[data-gate-locale]")?.getAttribute("data-gate-locale")
    ).toBe("en");
    expect(
      enContainer
        .querySelector("[data-workspace-locale]")
        ?.getAttribute("data-workspace-locale")
    ).toBe("en");

    const viTree = await LocaleHomePage({
      params: Promise.resolve({ locale: "vi" }),
    });
    const { container: viContainer } = render(viTree);
    expect(
      viContainer.querySelector("[data-gate-locale]")?.getAttribute("data-gate-locale")
    ).toBe("vi");
  });

  it("defaults getDictionary to en and returns vi only for vi", () => {
    expect(getDictionary("en").locale).toBe("en");
    expect(getDictionary("unknown").locale).toBe("en");
    expect(getDictionary("vi").locale).toBe("vi");
  });
});
