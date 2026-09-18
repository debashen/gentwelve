"use client";
import { useEffect, useState } from "react";
import type { SalesContact } from "@/lib/whatsapp";

export default function SalesContactSettings() {
  const [contact, setContact] = useState<SalesContact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    try {
      const response = await fetch("/api/admin/sales-contact", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setContact(data); setError("");
    } catch { setError("Could not load sales contact. Please retry."); }
  }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  return <section className="sales-contact-settings" aria-labelledby="sales-contact-title">
    <h2 id="sales-contact-title">WhatsApp / Sales Contact</h2>
    <p>Used for all future catalogue enquiries. Changes take effect as soon as you save.</p>
    {error && <p role="alert">{error}</p>}
    {!contact ? <button type="button" onClick={load}>{error ? "Retry" : "Loading sales contact…"}</button> : <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(""); setNotice("");
      try {
        const response = await fetch("/api/admin/sales-contact", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(contact) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setContact(data); setNotice("Sales contact saved.");
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save sales contact."); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy}><label>Contact / Salesperson Name<input required maxLength={80} autoComplete="name" value={contact.contactName} onChange={event => { setNotice(""); setContact({ ...contact, contactName: event.target.value }); }} /></label>
      <label>WhatsApp Number<input required type="tel" maxLength={40} autoComplete="tel" aria-describedby="whatsapp-format" value={contact.whatsappNumber} onChange={event => { setNotice(""); setContact({ ...contact, whatsappNumber: event.target.value }); }} /></label>
      <small id="whatsapp-format">Include the country code, for example +27 69 045 1055.</small>
      <button type="submit">{busy ? "Saving…" : "Save sales contact"}</button></fieldset>
    </form>}
    <p role="status">{notice}</p>
  </section>;
}
