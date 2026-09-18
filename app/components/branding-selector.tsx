import { brandingOptions } from "@/lib/whatsapp";
export default function BrandingSelector({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <fieldset className="detail-quantity"><legend>Do you need branding?</legend><div className="quantities">{brandingOptions.map(option => <button type="button" key={option} className={value === option ? "active" : ""} aria-pressed={value === option} onClick={() => onChange(option)}>{option}</button>)}</div></fieldset>;
}
