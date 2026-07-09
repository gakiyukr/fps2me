"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

const FIELDS = {
  FORMAT_INDICATOR: "00",
  INITIATION_POINT: "01",
  MERCHANT_ACCOUNT: "26",
  MERCHANT_CATEGORY: "52",
  TRANSACTION_CURRENCY: "53",
  TRANSACTION_AMOUNT: "54",
  COUNTRY_CODE: "58",
  MERCHANT_NAME: "59",
  MERCHANT_CITY: "60",
  ADDITIONAL_INFO: "62",
  CRC: "63",
};

const FPS = {
  UNIQUE_ID: "00",
  PARTICIPANT: "01",
  IDENTIFIER_FPS_ID: "02",
  IDENTIFIER_MOBILE: "03",
  IDENTIFIER_EMAIL: "04",
  REFERENCE: "05",
};

const CURRENCIES = {
  HKD: "344",
  CNY: "156",
};

const PHONE_REGIONS = {
  "852": { label: "+852 香港", digits: 8, pattern: /^\d{8}$/ },
  "86": { label: "+86 中國內地", digits: 11, pattern: /^\d{11}$/ },
  "853": { label: "+853 澳門", digits: 8, pattern: /^\d{8}$/ },
};

const BANKS = [
  ["", "不指定銀行 / 錢包"],
  ["003", "003 Standard Chartered"],
  ["004", "004 HSBC"],
  ["009", "009 CCB Asia"],
  ["012", "012 Bank of China (HK)"],
  ["015", "015 Bank of East Asia"],
  ["016", "016 DBS Hong Kong"],
  ["024", "024 Hang Seng Bank"],
  ["025", "025 Shanghai Commercial Bank"],
  ["027", "027 Bank of Communications HK"],
  ["040", "040 Dah Sing Bank"],
  ["041", "041 Chong Hing Bank"],
  ["043", "043 Nanyang Commercial Bank"],
  ["072", "072 ICBC Asia"],
  ["128", "128 Fubon Bank HK"],
  ["250", "250 Citibank Hong Kong"],
  ["382", "382 Bank of Communications (HK)"],
  ["387", "387 ZA Bank"],
  ["388", "388 Livi Bank"],
  ["389", "389 Mox Bank"],
  ["390", "390 WeLab Bank"],
  ["391", "391 Fusion Bank"],
  ["392", "392 PAO Bank"],
  ["393", "393 Ant Bank HK"],
  ["395", "395 Airstar Bank"],
  ["931", "931 WeChat Pay HK"],
  ["935", "935 Tap & Go"],
  ["948", "948 AlipayHK"],
  ["949", "949 Octopus"],
  ["954", "954 PayMe"],
  ["custom", "自定義收款機構代碼"],
];

function tlv(id, value = "") {
  const text = String(value);
  return `${id}${String(text.length).padStart(2, "0")}${text}`;
}

function crc16Ccitt(value) {
  let crc = 0xffff;
  for (let i = 0; i < value.length; i += 1) {
    crc ^= value.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function normalizePhone(rawValue, region = "852") {
  const value = rawValue.trim().replace(/\s+/g, "");
  const selectedRegion = PHONE_REGIONS[region] ? region : "852";
  const selected = PHONE_REGIONS[selectedRegion];

  if (!value) return "";
  if (value.startsWith("+852-") || value.startsWith("+86-") || value.startsWith("+853-")) {
    return value;
  }
  if (/^\+852\d{8}$/.test(value)) return `+852-${value.slice(4)}`;
  if (/^\+86\d{11}$/.test(value)) return `+86-${value.slice(3)}`;
  if (/^\+853\d{8}$/.test(value)) return `+853-${value.slice(4)}`;
  if (/^852\d{8}$/.test(value)) return `+852-${value.slice(3)}`;
  if (/^86\d{11}$/.test(value)) return `+86-${value.slice(2)}`;
  if (/^853\d{8}$/.test(value)) return `+853-${value.slice(3)}`;
  if (selected.pattern.test(value)) return `+${selectedRegion}-${value}`;
  return value;
}

function normalizeByType(type, rawValue, phoneRegion) {
  const value = rawValue.trim();
  if (!value) return { type: null, value: "" };
  if (type === "fpsId") return { type, value };
  if (type === "email") return { type, value: value.toLowerCase() };
  if (type === "mobile") return { type, value: normalizePhone(value, phoneRegion) };
  return { type: null, value };
}

function detectIdentifier(rawValue, mode, phoneRegion = "852") {
  const value = rawValue.trim();
  if (!value) return { type: null, value: "" };
  if (mode !== "auto") return normalizeByType(mode, value, phoneRegion);
  if (value.includes("@")) return { type: "email", value: value.toLowerCase() };
  if (/^\d{7}$/.test(value) || /^\d{9}$/.test(value)) return { type: "fpsId", value };
  if (/^\d{8}$/.test(value)) return { type: "mobile", value: `+852-${value}` };
  if (/^\d{11}$/.test(value)) return { type: "mobile", value: `+86-${value}` };
  if (/^852\d{8}$/.test(value)) return { type: "mobile", value: `+852-${value.slice(3)}` };
  if (/^86\d{11}$/.test(value)) return { type: "mobile", value: `+86-${value.slice(2)}` };
  if (/^853\d{8}$/.test(value)) return { type: "mobile", value: `+853-${value.slice(3)}` };
  if (/^\+852\d{8}$/.test(value)) return { type: "mobile", value: `+852-${value.slice(4)}` };
  if (/^\+86\d{11}$/.test(value)) return { type: "mobile", value: `+86-${value.slice(3)}` };
  if (/^\+853\d{8}$/.test(value)) return { type: "mobile", value: `+853-${value.slice(4)}` };
  if (
    /^\+852-\d{8}$/.test(value) ||
    /^\+86-\d{11}$/.test(value) ||
    /^\+853-\d{8}$/.test(value)
  ) {
    return { type: "mobile", value };
  }
  return { type: null, value };
}

function validateIdentifier(type, value) {
  if (type === "fpsId" && !/^\d{7,9}$/.test(value)) return "FPS ID 必須是 7 至 9 位數字。";
  if (
    type === "mobile" &&
    !/^\+852-\d{8}$/.test(value) &&
    !/^\+86-\d{11}$/.test(value) &&
    !/^\+853-\d{8}$/.test(value)
  ) {
    return "電話號碼只支援香港 8 位、中國內地 11 位或澳門 8 位號碼。";
  }
  if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "電郵格式不正確。";
  }
  if (!type) return "請輸入有效的 FPS ID、電話號碼或電郵。";
  return "";
}

function identifierLabel(type) {
  if (type === "fpsId") return "類型：FPS ID";
  if (type === "mobile") return "類型：電話號碼";
  if (type === "email") return "類型：電郵";
  return "類型：尚未識別";
}

function getParticipantCode(bank, customParticipantCode) {
  if (bank !== "custom") return bank;
  return customParticipantCode.trim();
}

function validateParticipantCode(participantCode) {
  if (participantCode && !/^\d{3}$/.test(participantCode)) {
    return "收款機構代碼必須是 3 位數字。";
  }
  return "";
}

function buildPayload({
  identifier,
  confirmation,
  mode,
  phoneRegion,
  bank,
  customParticipantCode,
  currency,
  amount,
  reference,
}) {
  const first = detectIdentifier(identifier, mode, phoneRegion);
  const second = detectIdentifier(confirmation, mode, phoneRegion);

  if (first.value !== second.value || first.type !== second.type) {
    throw new Error("兩次輸入的收款識別不一致。");
  }

  const identifierError = validateIdentifier(first.type, first.value);
  if (identifierError) throw new Error(identifierError);

  if (amount && Number(amount) <= 0) throw new Error("金額必須大於 0，或留空讓付款人輸入。");

  const cleanReference = reference.trim();
  if (cleanReference && !/^[A-Za-z0-9.@_+-]+$/.test(cleanReference)) {
    throw new Error("備註只支援英文字母、數字、. @ _ + -。");
  }

  const participantCode = getParticipantCode(bank, customParticipantCode);
  const participantError = validateParticipantCode(participantCode);
  if (participantError) throw new Error(participantError);

  let merchantAccount = tlv(FPS.UNIQUE_ID, "hk.com.hkicl");
  if (participantCode) merchantAccount += tlv(FPS.PARTICIPANT, participantCode);
  if (first.type === "fpsId") merchantAccount += tlv(FPS.IDENTIFIER_FPS_ID, first.value);
  if (first.type === "mobile") merchantAccount += tlv(FPS.IDENTIFIER_MOBILE, first.value);
  if (first.type === "email") merchantAccount += tlv(FPS.IDENTIFIER_EMAIL, first.value);

  let payload = "";
  payload += tlv(FIELDS.FORMAT_INDICATOR, "01");
  payload += tlv(FIELDS.INITIATION_POINT, "11");
  payload += tlv(FIELDS.MERCHANT_ACCOUNT, merchantAccount);
  payload += tlv(FIELDS.MERCHANT_CATEGORY, "0000");
  payload += tlv(FIELDS.TRANSACTION_CURRENCY, CURRENCIES[currency]);
  if (amount) payload += tlv(FIELDS.TRANSACTION_AMOUNT, Number(amount).toFixed(2));
  payload += tlv(FIELDS.COUNTRY_CODE, "HK");
  payload += tlv(FIELDS.MERCHANT_NAME, "NA");
  payload += tlv(FIELDS.MERCHANT_CITY, "HK");
  if (cleanReference) payload += tlv(FIELDS.ADDITIONAL_INFO, tlv(FPS.REFERENCE, cleanReference));

  const crcInput = `${payload}${FIELDS.CRC}04`;
  const crc = crc16Ccitt(crcInput);
  return { crc, payload: `${crcInput}${crc}` };
}

export default function Home() {
  const canvasRef = useRef(null);
  const [identifier, setIdentifier] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [mode, setMode] = useState("auto");
  const [phoneRegion, setPhoneRegion] = useState("852");
  const [bank, setBank] = useState("");
  const [customParticipantCode, setCustomParticipantCode] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("HKD");
  const [reference, setReference] = useState("");
  const [payload, setPayload] = useState("");
  const [crc, setCrc] = useState("未生成");
  const [message, setMessage] = useState("");

  const detected = useMemo(
    () => detectIdentifier(identifier, mode, phoneRegion),
    [identifier, mode, phoneRegion],
  );
  const typeMessage = identifier
    ? validateIdentifier(detected.type, detected.value) || identifierLabel(detected.type)
    : identifierLabel(null);
  const hasTypeError = Boolean(identifier && validateIdentifier(detected.type, detected.value));

  useEffect(() => {
    if (!payload || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, payload, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#16211f", light: "#ffffff" },
    });
  }, [payload]);

  function handleSubmit(event) {
    event.preventDefault();
    try {
      const result = buildPayload({
        identifier,
        confirmation,
        mode,
        phoneRegion,
        bank,
        customParticipantCode,
        currency,
        amount,
        reference,
      });
      setPayload(result.payload);
      setCrc(result.crc);
      setMessage("");
    } catch (error) {
      setMessage(error.message || String(error));
    }
  }

  async function copyPayload() {
    await navigator.clipboard.writeText(payload);
    setMessage("Payload 已複製。");
  }

  function downloadPng() {
    const link = document.createElement("a");
    link.download = "fps-qr.png";
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  }

  return (
    <main className="app-shell">
      <section className="workspace" aria-labelledby="page-title">
        <div className="panel form-panel">
          <div className="masthead">
            <p className="eyebrow">HK FPS QR</p>
            <h1 id="page-title">FPS ID QR 生成器</h1>
            <p className="intro">
              輸入 FPS ID、香港電話、大陸電話或電郵，選擇收款銀行，即時生成收款 QR。
            </p>
          </div>

          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>識別類型</span>
              <select value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="auto">自動識別</option>
                <option value="fpsId">FPS ID</option>
                <option value="mobile">電話</option>
                <option value="email">電郵</option>
              </select>
            </label>

            <div className={mode === "mobile" ? "phone-grid" : "phone-grid phone-grid-single"}>
              {mode === "mobile" ? (
                <label className="field">
                  <span>區號</span>
                  <select value={phoneRegion} onChange={(event) => setPhoneRegion(event.target.value)}>
                    {Object.entries(PHONE_REGIONS).map(([value, region]) => (
                      <option key={value} value={value}>
                        {region.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="field">
                <span>收款識別</span>
                <input
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  type="text"
                  autoComplete="off"
                  placeholder={
                    mode === "mobile"
                      ? `${PHONE_REGIONS[phoneRegion].digits} 位電話號碼`
                      : "例如 1234567 / 91234567 / name@example.com"
                  }
                  required
                />
                <small className={hasTypeError ? "error" : ""}>{typeMessage}</small>
              </label>
            </div>

            <label className="field">
              <span>再次確認</span>
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                type="text"
                autoComplete="off"
                placeholder="再次輸入收款識別"
                required
              />
            </label>

            <label className="field">
              <span>收款銀行 / 錢包</span>
              <select value={bank} onChange={(event) => setBank(event.target.value)}>
                {BANKS.map(([value, label]) => (
                  <option key={value || "none"} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            {bank === "custom" ? (
              <label className="field">
                <span>自定義收款機構代碼</span>
                <input
                  value={customParticipantCode}
                  onChange={(event) =>
                    setCustomParticipantCode(event.target.value.replace(/\D/g, "").slice(0, 3))
                  }
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="例如 043"
                />
                <small
                  className={
                    validateParticipantCode(customParticipantCode.trim()) ? "error" : ""
                  }
                >
                  {customParticipantCode
                    ? validateParticipantCode(customParticipantCode.trim()) || "將寫入 FPS 子欄位 01"
                    : "留空則不指定收款機構代碼"}
                </small>
              </label>
            ) : null}

            <div className="split">
              <label className="field">
                <span>金額</span>
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="可留空"
                />
              </label>

              <label className="field">
                <span>幣種</span>
                <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                  <option value="HKD">HKD</option>
                  <option value="CNY">CNY</option>
                </select>
              </label>
            </div>

            <label className="field">
              <span>備註 / Reference</span>
              <input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                type="text"
                maxLength={25}
                autoComplete="off"
                placeholder="可留空，最多 25 字元"
              />
            </label>

            <button type="submit">生成 QR Code</button>
            {message ? <p className="message">{message}</p> : null}
          </form>
        </div>

        <aside className="panel result-panel" aria-live="polite">
          <div className="qr-card">
            <canvas ref={canvasRef} width={320} height={320} />
            {!payload ? <div className="empty-state">QR Code 會顯示在這裡</div> : null}
          </div>

          <div className="summary">
            <div>
              <span>格式</span>
              <strong>EMVCo TLV / HKICL FPS</strong>
            </div>
            <div>
              <span>CRC</span>
              <strong>{crc}</strong>
            </div>
          </div>

          <label className="payload-box">
            <span>QR Payload</span>
            <textarea value={payload} readOnly rows={6} />
          </label>

          <div className="actions">
            <button type="button" onClick={copyPayload} disabled={!payload}>
              複製 Payload
            </button>
            <button type="button" onClick={downloadPng} disabled={!payload}>
              下載 PNG
            </button>
          </div>
        </aside>
      </section>

    </main>
  );
}
