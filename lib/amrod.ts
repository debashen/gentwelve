type RuntimeEnv = {
  AMROD_USERNAME?: string;
  AMROD_PASSWORD?: string;
  AMROD_CUSTOMER_CODE?: string;
  AMROD_MARKUP_RATE?: string;
  AMROD_COST_VAT_RATE?: string;
  AMROD_SYNC_KEY?: string;
};

const runtime = process.env as RuntimeEnv;
const IDENTITY_URL = "https://identity.amrod.co.za/VendorLogin";
const API_URL = "https://vendorapi.amrod.co.za/api/v1";

const username = runtime.AMROD_USERNAME;
const password = runtime.AMROD_PASSWORD;

function configured() { return Boolean(username && password && runtime.AMROD_CUSTOMER_CODE); }

export function getSyncKey() { return runtime.AMROD_SYNC_KEY; }

export function calculatePublicPriceCents(supplierPrice: number) {
  const vat = Number(runtime.AMROD_COST_VAT_RATE ?? "0.15");
  const markup = Number(runtime.AMROD_MARKUP_RATE ?? "0.35");
  return Math.ceil((supplierPrice * (1 + vat) * (1 + markup)) * 100);
}

export async function getAmrodToken() {
  if (!configured()) throw new Error("Amrod credentials are not configured.");
  const response = await fetch(IDENTITY_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ UserName: username, Password: password, CustomerCode: runtime.AMROD_CUSTOMER_CODE }),
  });
  if (!response.ok) throw new Error(`Amrod authentication failed (${response.status}).`);
  const payload = await response.json() as Record<string, unknown> | string;
  if (typeof payload === "string") return payload.replace(/^"|"$/g, "");
  const token = payload.Token ?? payload.token ?? payload.AccessToken ?? payload.accessToken;
  if (typeof token !== "string" || !token) throw new Error("Amrod returned no usable bearer token.");
  return token;
}

export async function fetchAmrodDataset(path: string, token: string) {
  const response = await fetch(`${API_URL}${path}`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  if (!response.ok) throw new Error(`Amrod request failed for ${path} (${response.status}).`);
  return response.json() as Promise<unknown>;
}

export async function fetchAmrodResponse(path: string, token: string) {
  const response = await fetch(`${API_URL}${path}`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  if (!response.ok) throw new Error(`Amrod request failed for ${path} (${response.status}).`);
  return response;
}

export async function* streamJsonObjects(response: Response): AsyncGenerator<Record<string, unknown>> {
  if (!response.body) throw new Error("Amrod returned an empty response stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let arrayStarted = false, objectDepth = 0, inString = false, escaped = false, buffer = "";
  const consume = function* (text: string) {
    for (const char of text) {
      if (!arrayStarted) { if (char === "[") arrayStarted = true; continue; }
      if (objectDepth === 0) { if (char === "{") { objectDepth = 1; buffer = "{"; inString = false; escaped = false; } continue; }
      buffer += char;
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") objectDepth++;
      else if (char === "}") {
        objectDepth--;
        if (objectDepth === 0) { const complete = buffer; buffer = ""; yield complete; }
      }
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      const text = decoder.decode(value, { stream: !done });
      for (const complete of consume(text)) yield JSON.parse(complete) as Record<string, unknown>;
      if (done) break;
    }
  } finally {
    try { await reader.cancel(); } catch { /* stream already closed */ }
  }
}

export function asArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(x => x && typeof x === "object") as Record<string, unknown>[];
  if (!payload || typeof payload !== "object") return [];
  const object = payload as Record<string, unknown>;
  for (const key of ["Data", "data", "Products", "products", "Result", "result", "Items", "items"]) if (Array.isArray(object[key])) return object[key] as Record<string, unknown>[];
  return [];
}

function pickText(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (typeof row[key] === "string" && row[key]) return row[key] as string;
  return "";
}

function pickNumber(row: Record<string, unknown>, keys: string[]) {
  const wanted = new Set(keys.map(key => key.toLowerCase()));
  for (const [key, value] of Object.entries(row)) {
    if (!wanted.has(key.toLowerCase())) continue;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function findImage(row: Record<string, unknown>): string {
  const direct = pickText(row, ["ImageUrl", "ImageURL", "imageUrl", "MainImage", "PrimaryImage", "Image", "Url", "URL", "url"]);
  if (direct) return direct;
  for (const key of ["Images", "images", "Media", "media", "Urls", "urls"]) {
    const value = row[key];
    if (Array.isArray(value)) for (const item of [...value].sort((a, b) => imageScore(b) - imageScore(a))) {
      if (typeof item === "string" && item.startsWith("http")) return item;
      if (item && typeof item === "object") { const image: string = findImage(item as Record<string, unknown>); if (image) return image; }
    }
  }
  return "";
}

function imageScore(value: unknown) {
  if (!value || typeof value !== "object") return 0;
  const image = value as Record<string, unknown>;
  const type = pickText(image, ["Type", "type", "Name", "name"]);
  return Number(Boolean(image.hasLogo ?? image.HasLogo)) * 100 + Number(/brand|logo|life/i.test(type)) * 30 + Number(Boolean(image.isDefault ?? image.IsDefault)) * 10;
}

function publicCategory(row: Record<string, unknown>, categories?: Array<Record<string, unknown>>) {
  const explicit = pickText(row, ["CategoryName", "categoryName", "Category", "category"]);
  const leaf = categories?.[0] ? pickText(categories[0], ["Name", "name"]) : "";
  const path = categories?.[0] ? pickText(categories[0], ["Path", "path", "Code", "code"]) : "";
  const value = `${explicit} ${leaf} ${path}`.toLowerCase();
  if (/drinkware|bottle|tumbler|mug|cup|flask/.test(value)) return "Drinkware";
  if (/clothing|apparel|shirt|jacket|workwear|headwear|\bcap\b|\bhat\b/.test(value)) return "Clothing";
  if (/\bbag|backpack|tote|luggage/.test(value)) return "Bags";
  if (/technology|electronics|power bank|\busb\b|charger|earbud|headphone|speaker|mobile/.test(value)) return "Tech";
  if (/stationery|office|notebook|diar|writing|\bpen\b/.test(value)) return "Office";
  if (/display|banner|signage|event|gazebo|tablecloth/.test(value)) return "Events";
  if (/outdoor|sport|fitness|leisure/.test(value)) return "Outdoor";
  return explicit || leaf || "Other";
}

function brandingMethods(row: Record<string, unknown>) {
  const methods = new Set<string>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    const name = pickText(object, ["MethodName", "BrandingMethod", "Name", "name"]);
    if (name && /print|engr|embro|transfer|sublim|deboss|brand/i.test(name)) methods.add(name);
    Object.values(object).forEach(walk);
  };
  for (const key of ["Branding", "branding", "Positions", "positions", "BrandingPositions"]) walk(row[key]);
  return [...methods].slice(0, 12);
}

export function normaliseProduct(row: Record<string, unknown>) {
  const supplierCode = pickText(row, ["SimpleCode", "simpleCode", "ProductCode", "productCode", "Code", "code", "SKU", "Sku"]);
  const name = pickText(row, ["ProductName", "productName", "Name", "name", "Description", "description"]);
  if (!supplierCode || !name) return null;
  const categories = (row.Categories ?? row.categories) as Array<Record<string, unknown>> | undefined;
  const brandValue = row.Brand ?? row.brand;
  const nestedBrand = brandValue && typeof brandValue === "object" ? pickText(brandValue as Record<string, unknown>, ["Name", "name"]) : "";
  return {
    supplierCode, name,
    description: pickText(row, ["LongDescription", "longDescription", "Description", "description"]),
    productType: pickText(row, ["Type", "TYPE", "type"]) || "product",
    category: publicCategory(row, categories),
    brand: pickText(row, ["BrandName", "brandName", "Brand", "brand"]) || nestedBrand,
    imageUrl: findImage(row),
    minimumQuantity: Math.max(0, pickNumber(row, ["Minimum", "minimum", "MinimumQuantity", "minimumQuantity"]) ?? 0) || null,
    brandingMethods: brandingMethods(row),
    rawJson: JSON.stringify(row),
  };
}

export function getProductCode(row:Record<string,unknown>){
  return pickText(row,["SimpleCode","simpleCode","ProductCode","productCode","Code","code","SKU","Sku"]);
}

function attributeValue(row: Record<string, unknown>, pattern: RegExp) {
  const attributes = (row.CategorisedAttribute ?? row.categorisedAttribute ?? row.Attributes ?? row.attributes) as unknown;
  if (!Array.isArray(attributes)) return "";
  for (const entry of attributes) {
    if (!entry || typeof entry !== "object") continue;
    const object = entry as Record<string, unknown>;
    const key = pickText(object, ["Name", "name", "Key", "key", "Attribute", "attribute"]);
    if (pattern.test(key)) return pickText(object, ["Value", "value", "Description", "description", "Name", "name"]);
  }
  return "";
}

export function extractProductVariants(row: Record<string, unknown>) {
  const productCode = pickText(row, ["SimpleCode", "simpleCode", "ProductCode", "productCode", "Code", "code"]);
  const candidates: Record<string, unknown>[] = [row];
  for (const key of ["Variants", "variants", "Products", "products", "Items", "items", "Children", "children"]) {
    const value = row[key];
    if (Array.isArray(value)) for (const item of value) if (item && typeof item === "object") candidates.push(item as Record<string, unknown>);
  }
  const unique = new Map<string, { productCode:string; fullCode:string; colour:string; size:string; imageUrl:string }>();
  for (const candidate of candidates) {
    const fullCode = pickText(candidate, ["FullCode", "fullCode", "SKU", "Sku", "sku", "Code", "code"]);
    if (!fullCode) continue;
    unique.set(fullCode, {
      productCode: pickText(candidate, ["SimpleCode", "simpleCode", "ProductCode", "productCode"]) || productCode || fullCode,
      fullCode,
      colour: pickText(candidate, ["Colour", "colour", "Color", "color", "ColourName", "colourName"]) || attributeValue(candidate, /colou?r/i),
      size: pickText(candidate, ["Size", "size", "SizeName", "sizeName"]) || attributeValue(candidate, /size/i),
      imageUrl: findImage(candidate) || findImage(row),
    });
  }
  return [...unique.values()];
}

export function normalisePrice(row: Record<string, unknown>) {
  const fullCode = pickText(row, ["FullCode", "fullCode", "ProductCode", "productCode", "Code", "code", "SKU", "Sku", "sku"]);
  const supplierPrice = pickNumber(row, ["Price", "UnitPrice", "CustomerPrice", "SellingPrice", "Amount", "Value"]);
  if (!fullCode || supplierPrice === null) return null;
  return {
    fullCode,
    productCode: pickText(row, ["SimpleCode", "simpleCode", "BaseCode", "baseCode"]) || fullCode,
    supplierPriceCents: Math.round(supplierPrice * 100),
    publicPriceCents: calculatePublicPriceCents(supplierPrice),
  };
}

export function normaliseStock(row: Record<string, unknown>) {
  const fullCode = pickText(row, ["FullCode", "fullCode", "ProductCode", "productCode", "Code", "code", "SKU", "Sku", "sku"]);
  const type = pickNumber(row, ["Type", "StockType", "type", "stockType"]);
  const quantity = pickNumber(row, ["CurrentStock", "Stock", "StockQuantity", "Quantity", "Qty", "Available"]);
  if (!fullCode || quantity === null || (type !== null && type !== 2)) return null;
  return {
    fullCode,
    productCode: pickText(row, ["SimpleCode", "simpleCode", "BaseCode", "baseCode"]) || fullCode,
    stockQuantity: Math.max(0, Math.floor(quantity)),
  };
}
