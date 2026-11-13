"use client";
import { useParams } from "next/navigation";
import { EmployeeProfile } from "../profile";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <section className="page active"><EmployeeProfile key={id} id={id} /></section>;
}
