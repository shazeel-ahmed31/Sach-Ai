import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Report from "@/pages/Report";
import { api } from "@/services/api";

vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return { ...actual, api: { ...actual.api, getScan: vi.fn() } };
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("report routes", () => {
  it("shows a clearly labeled public sample without requesting private data", () => {
    render(<MemoryRouter initialEntries={["/report"]}><Report /></MemoryRouter>);
    expect(screen.getByText(/Sample report with illustrative scores/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "sample_clip_03.mp4" })).toBeInTheDocument();
    expect(api.getScan).not.toHaveBeenCalled();
  });

  it("shows an unavailable private scan without substituting sample results", async () => {
    vi.mocked(api.getScan).mockRejectedValueOnce(new Error("missing scan"));
    render(<MemoryRouter initialEntries={["/report?scan=missing"]}><Report /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Report unavailable" })).toBeInTheDocument());
    expect(api.getScan).toHaveBeenCalledWith("missing");
    expect(screen.queryByText(/Sample report with illustrative scores/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "sample_clip_03.mp4" })).not.toBeInTheDocument();
  });
});
