import { redirect } from "next/navigation";

/* Trang cũ "Tạm ứng lương" đã gộp vào Lương & tạm ứng (/payroll); giữ đường dẫn cũ cho dấu trang/liên kết đã gửi */
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  redirect(`/payroll?tab=${tab === "salary" ? "salary" : "advances"}`);
}
