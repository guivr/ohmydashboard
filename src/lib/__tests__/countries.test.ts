import { describe, it, expect } from "vitest";
import {
  resolveCountryCode,
  getCountryName,
  isValidCountryCode,
} from "../countries";

describe("resolveCountryCode", () => {
  it("resolves standard English names", () => {
    expect(resolveCountryCode("United States")).toBe("US");
    expect(resolveCountryCode("Germany")).toBe("DE");
    expect(resolveCountryCode("Japan")).toBe("JP");
    expect(resolveCountryCode("Brazil")).toBe("BR");
    expect(resolveCountryCode("Australia")).toBe("AU");
  });

  it("resolves formal UN-style names used by RevenueCat", () => {
    expect(resolveCountryCode("Korea, Republic of")).toBe("KR");
    expect(resolveCountryCode("Russian Federation")).toBe("RU");
    expect(resolveCountryCode("Viet Nam")).toBe("VN");
    expect(resolveCountryCode("Iran, Islamic Republic of")).toBe("IR");
    expect(resolveCountryCode("Bolivia, Plurinational State of")).toBe("BO");
    expect(resolveCountryCode("Venezuela, Bolivarian Republic of")).toBe("VE");
    expect(resolveCountryCode("Tanzania, United Republic of")).toBe("TZ");
    expect(resolveCountryCode("Palestine, State of")).toBe("PS");
    expect(resolveCountryCode("Congo, the Democratic Republic of the")).toBe(
      "CD"
    );
    expect(resolveCountryCode("Moldova, Republic of")).toBe("MD");
  });

  it("resolves countries that had Intl.DisplayNames issues", () => {
    expect(resolveCountryCode("Turkey")).toBe("TR");
    expect(resolveCountryCode("France")).toBe("FR");
    expect(resolveCountryCode("Hong Kong")).toBe("HK");
    expect(resolveCountryCode("Serbia")).toBe("RS");
  });

  it("resolves multi-word country names", () => {
    expect(resolveCountryCode("Saint Lucia")).toBe("LC");
    expect(resolveCountryCode("Trinidad and Tobago")).toBe("TT");
    expect(resolveCountryCode("Antigua and Barbuda")).toBe("AG");
    expect(resolveCountryCode("North Macedonia")).toBe("MK");
    expect(resolveCountryCode("Czechia")).toBe("CZ");
  });

  it("resolves common short/alternate names", () => {
    expect(resolveCountryCode("South Korea")).toBe("KR");
  });

  it("passes through valid ISO alpha-2 codes unchanged", () => {
    expect(resolveCountryCode("US")).toBe("US");
    expect(resolveCountryCode("de")).toBe("DE"); // lowercased input
    expect(resolveCountryCode("GB")).toBe("GB");
    expect(resolveCountryCode("XK")).toBe("XK"); // Kosovo
  });

  it("returns 'Unknown' for empty/missing input", () => {
    expect(resolveCountryCode("")).toBe("Unknown");
  });

  it("handles the 'Unknown' sentinel value", () => {
    expect(resolveCountryCode("Unknown")).toBe("Unknown");
  });

  it("resolves accented country names by stripping diacritics", () => {
    expect(resolveCountryCode("Réunion")).toBe("RE");
    expect(resolveCountryCode("Côte d'Ivoire")).toBe("CI");
    expect(resolveCountryCode("Curaçao")).toBe("CW");
    expect(resolveCountryCode("São Tomé and Príncipe")).toBe("ST");
  });

  it("returns raw input for unrecognized names", () => {
    expect(resolveCountryCode("Narnia")).toBe("Narnia");
  });
});

describe("getCountryName", () => {
  it("converts ISO codes to English display names", () => {
    expect(getCountryName("US")).toBe("United States of America");
    expect(getCountryName("DE")).toBe("Germany");
    expect(getCountryName("JP")).toBe("Japan");
    expect(getCountryName("BR")).toBe("Brazil");
  });

  it("returns special values as-is", () => {
    expect(getCountryName("Unknown")).toBe("Unknown");
    expect(getCountryName("Other")).toBe("Other");
    expect(getCountryName("")).toBe("");
  });

  it("returns the code itself for invalid codes", () => {
    expect(getCountryName("XX")).toBe("XX");
  });
});

describe("isValidCountryCode", () => {
  it("accepts valid ISO alpha-2 codes", () => {
    expect(isValidCountryCode("US")).toBe(true);
    expect(isValidCountryCode("DE")).toBe(true);
    expect(isValidCountryCode("JP")).toBe(true);
  });

  it("accepts Kosovo (XK)", () => {
    expect(isValidCountryCode("XK")).toBe(true);
  });

  it("rejects invalid codes", () => {
    expect(isValidCountryCode("XX")).toBe(false);
    expect(isValidCountryCode("Unknown")).toBe(false);
    expect(isValidCountryCode("")).toBe(false);
    expect(isValidCountryCode("USA")).toBe(false);
  });
});
