import { describe, expect, it } from "vitest";
import { explainConfig } from "../lib/explain";
import { presets } from "../lib/presets";
import {
  detectUiLanguage,
  directionDisplayName,
  isUiLanguage,
  presetDisplayName,
  readUiLanguageCookie,
  resolveUiLanguage,
  serializeUiLanguageCookie,
  timeframeDisplayName,
  uiText
} from "../lib/ui-i18n";

describe("Studio UI languages", () => {
  it("uses Turkish only when the browser's primary language is Turkish", () => {
    expect(detectUiLanguage(["tr-TR", "en-US"])).toBe("tr");
    expect(detectUiLanguage(["en-US", "tr-TR"])).toBe("en");
    expect(detectUiLanguage([])).toBe("en");
  });

  it("accepts only supported saved preferences", () => {
    expect(isUiLanguage("tr")).toBe(true);
    expect(isUiLanguage("en")).toBe(true);
    expect(isUiLanguage("de")).toBe(false);
    expect(isUiLanguage(null)).toBe(false);
  });

  it("reads and writes the non-sensitive language preference cookie", () => {
    expect(readUiLanguageCookie("theme=dark; kohen_pine_studio_language=tr")).toBe("tr");
    expect(readUiLanguageCookie("kohen_pine_studio_language=de")).toBeNull();
    expect(serializeUiLanguageCookie("en")).toContain("kohen_pine_studio_language=en");
    expect(serializeUiLanguageCookie("en")).toContain("SameSite=Lax");
  });

  it("prefers the latest cookie choice, then storage, then browser language", () => {
    expect(resolveUiLanguage("tr", "en", ["en-US"])).toBe("tr");
    expect(resolveUiLanguage(null, "en", ["tr-TR"])).toBe("en");
    expect(resolveUiLanguage(null, null, ["tr-TR"])).toBe("tr");
  });

  it("translates visible labels without changing their internal values", () => {
    expect(uiText("tr", "Guided Builder")).toBe("Rehberli Oluşturucu");
    expect(uiText("en", "Guided Builder")).toBe("Guided Builder");
    expect(directionDisplayName("tr", "long_short")).toBe("Long + Short");
    expect(timeframeDisplayName("tr", "240")).toBe("4 saat");
    expect(presetDisplayName("tr", "VWAP Reclaim")).toBe("VWAP Geri Kazanımı");
    expect(uiText("tr", "Not investment advice.")).toBe("Yatırım tavsiyesi değildir.");
  });

  it("provides a Turkish plain-language explanation for Kohen Dive", () => {
    const preset = presets.find((item) => item.presetId === "kohen_dive_adaptive");
    expect(preset).toBeDefined();

    const turkish = explainConfig(preset!, "tr").join(" ");
    const english = explainConfig(preset!).join(" ");

    expect(turkish).toContain("Varsayılan ayarı Active 4H");
    expect(turkish).toContain("bir sonraki mum açılışını");
    expect(english).toContain("It opens with the Active 4H");
  });
});
