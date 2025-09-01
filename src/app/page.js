"use client";

import { useCallback, useMemo, useState, memo, useEffect, useRef } from "react";
import Image from "next/image";
import { db } from "@/lib/firebase";
import {
  Timestamp,
  collection,
  getDocs,
  orderBy,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import {
  AppBar,
  // Avatar,
  Box,
  Button,
  Container,
  Divider,
  Toolbar,
  Typography,
  TextField,
  Alert,
  CircularProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TableSortLabel,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import SearchIcon from "@mui/icons-material/Search";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";
import { verifyTOTP, parseTotpConfig } from "@/lib/totp";

const FIELDS = [
  "accountNumber",
  "bankCode",
  "bankName",
  "branchCode",
  "branchName",
  "createdAt",
  "deviceName",
  "email",
  "errorInfo",
  "finishedAt",
  "flag",
  "kyash",
  "kyashTransferId",
  "mailwiseId",
  "purchaseAmount",
  "purchasePercent",
  "siteName",
  "transferFee",
  "transferPrice",
  "userName",
  "uuid",
];

// Display order for table (CSV order remains FIELDS)
const DISPLAY_FIELDS = [
  "createdAt",
  "finishedAt",
  "uuid",
  "kyashTransferId",
  "flag",
  "bankName",
  "branchName",
  "accountNumber",
  "bankCode",
  "branchCode",
  "userName",
  "email",
  "siteName",
  "purchaseAmount",
  "purchasePercent",
  "transferFee",
  "transferPrice",
  "deviceName",
  "kyash",
  "mailwiseId",
  "errorInfo",
];

// Header labels for display
const HEADER_LABELS = {
  accountNumber: "口座番号",
  bankCode: "銀行コード",
  bankName: "銀行名",
  branchCode: "支店コード",
  branchName: "支店名",
  createdAt: "振込処理開始日時",
  deviceName: "デバイス",
  email: "メールアドレス",
  errorInfo: "エラー",
  finishedAt: "振込処理完了日時",
  flag: "状態",
  kyash: "Kyash",
  kyashTransferId: "transfer_id",
  mailwiseId: "MailWiseID",
  purchaseAmount: "買取金額",
  purchasePercent: "買取率",
  siteName: "番組名",
  transferFee: "振込手数料",
  transferPrice: "振込金額",
  transferPriceBeforeFee: "振込額（手数料控除前）",
  userName: "振込人名",
  uuid: "uuid",
};

function toTokyoString(ts) {
  if (!ts) return "";
  const d = ts instanceof Timestamp ? ts.toDate() : ts;
  if (!(d instanceof Date)) return "";
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  const y = get("year");
  const m = get("month");
  const day = get("day");
  const hh = get("hour").padStart(2, "0");
  const mm = get("minute").padStart(2, "0");
  const ss = get("second").padStart(2, "0");
  return `${y}/${m.padStart(2, "0")}/${day.padStart(2, "0")} ${hh}:${mm}:${ss}`;
}

function normalizeValue(key, value) {
  if (value == null) return "";
  if (key === "createdAt" || key === "finishedAt") {
    return toTokyoString(value);
  }
  if (key === "flag") {
    const v = String(value ?? "");
    if (!v) return "";
    if (v === "finish") return "振込完了";
    if (v === "error") return "エラー";
    return v;
  }
  if (key === "kyash") {
    // Treat truthy as Kyash, falsy as GMO
    return value ? "Kyash" : "GMO";
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (value instanceof Timestamp) return toTokyoString(value);
  return JSON.stringify(value);
}

function toCsv(rows) {
  const escape = (s) => {
    const str = String(s ?? "");
    if (/[",\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };
  const header = DISPLAY_FIELDS.map((k) => escape(HEADER_LABELS[k] ?? k)).join(",");
  const lines = rows.map((row) => DISPLAY_FIELDS.map((k) => escape(row[k])).join(","));
  const csv = [header, ...lines].join("\n");
  return "\uFEFF" + csv; // BOM for Excel
}

//

const Controls = memo(function Controls({ onSearch, onDownloadCsv, docsLength, counts }) {
  const { start: defaultStart, end: defaultEnd } = (() => {
    const now = dayjs();
    const y = now.subtract(1, "day");
    const s = y.startOf("day");
    const e = y.endOf("day");
    return { start: s, end: e };
  })();
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSearch = Boolean(start && end && start.isValid?.() && end.isValid?.());

  const StatLabel = ({ left, right }) => (
    <Box sx={{ display: "flex", alignItems: "center" }}>
      <Box component="span">{left}</Box>
      <Box sx={{ borderLeft: 1, borderColor: "divider", height: 16, mx: 1 }} />
      <Box component="span" sx={{ fontWeight: 600 }}>
        {right}
      </Box>
    </Box>
  );

  const handleSearch = async () => {
    setError("");
    setLoading(true);
    try {
      const s = start?.startOf?.("day");
      const e = end?.endOf?.("day");
      await onSearch(s?.toDate?.(), e?.toDate?.());
    } catch (e) {
      setError(e?.message || "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, maxWidth: 720 }}>
        <DatePicker
          label="開始"
          value={start}
          onChange={(v) => setStart(v)}
          views={["year", "month", "day"]}
          slotProps={{ actionBar: { actions: ["today"] } }}
        />
        <DatePicker
          label="終了"
          value={end}
          onChange={(v) => setEnd(v)}
          views={["year", "month", "day"]}
          slotProps={{ actionBar: { actions: ["today"] } }}
        />
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={18} /> : <SearchIcon />}
          onClick={handleSearch}
          disabled={!canSearch || loading}
        >
          {loading ? "検索中..." : "検索"}
        </Button>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={onDownloadCsv} disabled={!docsLength}>
          CSVダウンロード
        </Button>
        <Chip label={<StatLabel left="合計" right={`${docsLength}件`} />} color="primary" variant="outlined" />
        <Chip label={<StatLabel left="正常" right={`${counts.normal}件`} />} variant="outlined" />
        <Chip label={<StatLabel left="エラー" right={`${counts.error}件`} />} variant="outlined" />
        <Chip label={<StatLabel left="Kyash" right={`${counts.kyash}件`} />} variant="outlined" />
        <Chip label={<StatLabel left="GMO" right={`${counts.gmo}件`} />} variant="outlined" />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </>
  );
});

const TableView = memo(function TableView({ docs, rawDocs }) {
  const [orderByKey, setOrderByKey] = useState("createdAt");
  const [order, setOrder] = useState("asc");

  const handleRequestSort = (property) => {
    const isAsc = orderByKey === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderByKey(property);
  };

  function cmp(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return 1; // nulls last
    if (b == null) return -1;
    if (a instanceof Timestamp && b instanceof Timestamp) return a.toMillis() - b.toMillis();
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? 1 : -1;
    return String(a).localeCompare(String(b), "ja");
  }

  const sortedDocs = useMemo(() => {
    if (!docs.length) return [];
    const indices = docs.map((_, i) => i);
    indices.sort((i, j) => {
      const va = rawDocs[i]?.[orderByKey];
      const vb = rawDocs[j]?.[orderByKey];
      const res = cmp(va, vb);
      return order === "asc" ? res : -res;
    });
    return indices.map((i) => docs[i]);
  }, [docs, rawDocs, orderByKey, order]);

  return (
    <Table size="small" sx={{ width: "100%" }}>
      <TableHead sx={{ position: "sticky", top: 0, zIndex: 2 }}>
        <TableRow
          sx={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            backgroundColor: "rgba(0, 0, 45, 1)",
          }}
        >
          {DISPLAY_FIELDS.map((key) => (
            <TableCell
              key={key}
              sortDirection={orderByKey === key ? order : false}
              sx={{
                whiteSpace: "nowrap",
                py: 0.5,
                px: 0.75,
                color: "#fff",
                position: "relative",
                zIndex: 2,
                backgroundColor: "transparent !important",
                backgroundImage: "none !important",
              }}
            >
              <TableSortLabel
                active={orderByKey === key}
                direction={orderByKey === key ? order : "asc"}
                onClick={() => handleRequestSort(key)}
                hideSortIcon={orderByKey !== key}
                sx={{
                  color: "#fff !important",
                  "&:hover": { color: "#fff" },
                  "&.Mui-active": {
                    color: "#fff",
                    "& .MuiTableSortLabel-icon": { color: "#fff !important", opacity: 1 },
                    "& .MuiTableSortLabel-iconDirectionAsc": { color: "#fff !important", opacity: 1 },
                    "& .MuiTableSortLabel-iconDirectionDesc": { color: "#fff !important", opacity: 1 },
                  },
                }}
              >
                {HEADER_LABELS[key] ?? key}
              </TableSortLabel>
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {sortedDocs.map((row, idx) => (
          <TableRow key={idx}>
            {DISPLAY_FIELDS.map((f) => (
              <TableCell key={f} sx={{ whiteSpace: "nowrap", py: 0.5, px: 0.75 }}>
                {row[f] ?? ""}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
});

const AuthGate = memo(function AuthGate({ onAuthed }) {
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [cfg, setCfg] = useState({ digits: 6, period: 30, algorithm: "SHA-1" });
  const [digitsArr, setDigitsArr] = useState(() => Array(6).fill(""));
  const inputsRef = useRef([]);

  // already authed in this session
  useEffect(() => {
    try {
      if (sessionStorage.getItem("makoCsvAuthed") === "1") {
        onAuthed();
      }
    } catch {}
  }, [onAuthed]);

  // fetch secret from Firestore
  useEffect(() => {
    (async () => {
      try {
        const ref = doc(db, "csv", "main");
        const snap = await getDoc(ref);
        const s = snap.exists() ? snap.data()?.key : "";
        if (!s) throw new Error("認証キーが見つかりません");
        const parsed = parseTotpConfig(String(s));
        setSecret(String(parsed.secret));
        setCfg({ digits: parsed.digits, period: parsed.period, algorithm: parsed.algorithm });
      } catch (e) {
        setError(e?.message || "認証キーの取得に失敗しました");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // No test display; keep UI minimal

  // Adjust digit boxes length when cfg changes
  useEffect(() => {
    const len = Number(cfg?.digits) || 6;
    setDigitsArr(Array(len).fill(""));
    setCode("");
    inputsRef.current = [];
  }, [cfg.digits]);

  // Keep code string in sync
  useEffect(() => {
    setCode(digitsArr.join(""));
  }, [digitsArr]);

  const focusAt = (i) => {
    const el = inputsRef.current?.[i];
    if (el && typeof el.focus === "function") el.focus();
  };

  const handleDigitChange = (i, v) => {
    const s = String(v || "").replace(/\D/g, "");
    if (!s) {
      setDigitsArr((arr) => arr.map((d, idx) => (idx === i ? "" : d)));
      return;
    }
    const chars = s.split("");
    setDigitsArr((arr) => {
      const next = arr.slice();
      let idx = i;
      for (const ch of chars) {
        if (idx >= next.length) break;
        next[idx] = ch;
        idx++;
      }
      // move focus to next empty or last filled
      const nextIndex = Math.min(idx, next.length - 1);
      setTimeout(() => focusAt(nextIndex), 0);
      return next;
    });
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace") {
      if (!digitsArr[i]) {
        // move back and clear
        if (i > 0) {
          setDigitsArr((arr) => arr.map((d, idx) => (idx === i - 1 ? "" : d)));
          setTimeout(() => focusAt(i - 1), 0);
        }
      } else {
        // clear current
        setDigitsArr((arr) => arr.map((d, idx) => (idx === i ? "" : d)));
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      focusAt(i - 1);
    } else if (e.key === "ArrowRight" && i < digitsArr.length - 1) {
      e.preventDefault();
      focusAt(i + 1);
    }
  };

  const handlePaste = (i, e) => {
    const text = (e.clipboardData || window.clipboardData).getData("text");
    const s = String(text || "").replace(/\D/g, "");
    if (!s) return;
    e.preventDefault();
    setDigitsArr((arr) => {
      const next = arr.slice();
      let idx = i;
      for (const ch of s) {
        if (idx >= next.length) break;
        next[idx] = ch;
        idx++;
      }
      setTimeout(() => focusAt(Math.min(idx, next.length - 1)), 0);
      return next;
    });
  };

  const handleVerify = async () => {
    setError("");
    setLoading(true);
    try {
      if (!secret) throw new Error("認証キー未取得です");
      if (!new RegExp(`^\\d{${cfg.digits}}$`).test(code)) throw new Error(`${cfg.digits}桁のコードを入力してください`);
      const ok = await verifyTOTP(secret, code, { window: 1, ...cfg });
      if (!ok) throw new Error("コードが正しくありません");
      try { sessionStorage.setItem("makoCsvAuthed", "1"); } catch {}
      onAuthed();
    } catch (e) {
      setError(e?.message || "認証に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", px: 2 }}>
      <Container maxWidth="sm">
        <Paper sx={{ p: 4 }}>
          <Typography variant="h6" align="center" gutterBottom>
            Google Authenticator 認証
          </Typography>
          {!ready ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 2, justifyContent: "center" }}>
              <CircularProgress size={20} />
              <Typography variant="body2">認証キーを取得中...</Typography>
            </Box>
          ) : (
            <>
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: "flex", gap: 1, justifyContent: "center" }}>
                  {digitsArr.map((val, idx) => (
                    <TextField
                      key={idx}
                      value={val}
                      onChange={(e) => handleDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(idx, e)}
                      onPaste={(e) => handlePaste(idx, e)}
                      inputRef={(el) => (inputsRef.current[idx] = el)}
                      inputProps={{
                        inputMode: "numeric",
                        pattern: "[0-9]*",
                        maxLength: 1,
                        style: { textAlign: "center", fontSize: "1.6rem", padding: "10px 0" },
                      }}
                      sx={{ width: 56 }}
                    />
                  ))}
                </Box>
              </Box>
              <Box sx={{ mt: 3, display: "flex", justifyContent: "center" }}>
                <Button
                  variant="contained"
                  onClick={handleVerify}
                  disabled={loading}
                  sx={{
                    color: "#fff",
                    minWidth: 240,
                    justifyContent: "center",
                    textAlign: "center",
                    boxShadow: "none",
                    background: "linear-gradient(45deg, rgba(65, 89, 208, 1) 0%, rgba(200, 79, 192, 1) 50%, rgba(255, 205, 112, 1) 100%)",
                    '&:hover': {
                      boxShadow: "none",
                      opacity: 0.9,
                      background: "linear-gradient(45deg, rgba(65, 89, 208, 1) 0%, rgba(200, 79, 192, 1) 50%, rgba(255, 205, 112, 1) 100%)",
                    },
                  }}
                >
                  {loading ? "認証中..." : "認証"}
                </Button>
              </Box>
            </>
          )}
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </Paper>
      </Container>
    </Box>
  );
});

export default function Home() {
  const [authed, setAuthed] = useState(false);
  const [docs, setDocs] = useState([]); // display strings
  const [rawDocs, setRawDocs] = useState([]); // raw values for sorting

  const runQuery = useCallback(async (start, end) => {
    setDocs([]);
    try {
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        throw new Error("開始・終了日時の形式が不正です");
      }
      if (endDate <= startDate) {
        throw new Error("終了日時は開始より後にしてください");
      }

      const ref = collection(db, "transfer");
      const q = query(
        ref,
        where("createdAt", ">=", Timestamp.fromDate(startDate)),
        where("createdAt", "<=", Timestamp.fromDate(endDate)),
        orderBy("createdAt", "asc")
      );

      const snap = await getDocs(q);
      const rows = snap.docs.map((d) => {
        const data = d.data();
        const row = {};
        for (const key of FIELDS) {
          row[key] = normalizeValue(key, data?.[key]);
        }
        return row;
      });
      const rawRows = snap.docs.map((d) => {
        const data = d.data();
        const row = {};
        for (const key of FIELDS) {
          row[key] = data?.[key];
        }
        return row;
      });
      setDocs(rows);
      setRawDocs(rawRows);
    } catch (e) {
      console.error(e);
      throw e;
    }
  }, []);

  const downloadCsv = useCallback(async () => {
    const csv = toCsv(docs);
    // Build safe filename
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const fname = `transfer_createdAt_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.csv`;

    // Prefer Tauri v2 plugins if available (native save dialog)
    let handledByTauri = false;
    if (typeof window !== "undefined") {
      const isTauri = Boolean(window && window.__TAURI__);
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const path = await save({ defaultPath: fname, filters: [{ name: "CSV", extensions: ["csv"] }] });
        // In Tauri: treat null as user-cancelled (stop). In Web: fall through to browser fallback.
        if (path == null && isTauri) return;
        try {
          const { writeTextFile, writeFile } = await import("@tauri-apps/plugin-fs");
          if (typeof writeTextFile === "function") {
            await writeTextFile(path, csv);
          } else if (typeof writeFile === "function") {
            const encoder = new TextEncoder();
            await writeFile({ path, contents: encoder.encode(csv) });
          } else {
            throw new Error("Tauri FS plugin not available");
          }
          handledByTauri = true;
        } catch (e) {
          console.warn("Tauri FS plugin not available, falling back to browser download", e);
        }
      } catch (e) {
        // Tauri plugin not present; continue to browser fallback
      }
    }

    if (handledByTauri) return;

    // Browser Save File Picker (if supported)
    try {
      if (typeof window !== "undefined" && typeof window.showSaveFilePicker === "function") {
        const handle = await window.showSaveFilePicker({
          suggestedName: fname,
          types: [
            {
              description: "CSV",
              accept: { "text/csv": [".csv"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
        await writable.close();
        return;
      }
    } catch (e) {
      // If user cancels or API fails, fall back to anchor download
      if (e && typeof e === "object" && e.name === "AbortError") return; // user cancelled
      console.warn("Save File Picker unavailable/failed, falling back to anchor download", e);
    }

    // Browser fallback
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        try {
          a.remove();
        } catch {}
      }, 0);
    } catch (e) {
      console.error(e);
      alert("CSVのダウンロードに失敗しました");
    }
  }, [docs]);

  const counts = useMemo(() => {
    const total = rawDocs.length;
    if (!total) return { normal: 0, error: 0, kyash: 0, gmo: 0 };
    let normal = 0,
      error = 0,
      kyash = 0;
    for (const d of rawDocs) {
      if (d?.flag === "finish") normal++;
      if (d?.flag === "error") error++;
      if (d?.kyash) kyash++;
    }
    const gmo = total - kyash; // falsyはGMO扱い
    return { normal, error, kyash, gmo };
  }, [rawDocs]);

  if (!authed) return <AuthGate onAuthed={() => setAuthed(true)} />;

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar
        position="static"
        color="transparent"
        enableColorOnDark
        sx={{
          boxShadow: "none",
          color: "#fff",
          borderBottom: "1px solid #1f1f22",
          backgroundImage:
            "linear-gradient(90deg, rgba(0, 0, 45, 1), rgba(12, 70, 79, 1))",
        }}
      >
        <Toolbar>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Image src="icon.png" alt="app icon" width={28} height={28} />
            <Typography variant="h6" component="div">M-Log CSV Exporter</Typography>
          </Box>
        </Toolbar>
      </AppBar>
      <Container
        maxWidth={false}
        sx={{
          py: 5,
          px: { xs: 2, sm: 3 },
          pb: 6,
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 64px)",
        }}
      >
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 2 }}>
            検索条件
          </Typography>
          <Controls
            onSearch={runQuery}
            onDownloadCsv={downloadCsv}
            docsLength={docs.length}
            counts={counts}
          />
        </Paper>

        <Box sx={{ flex: 1, minHeight: 0 }}>
          <TableContainer component={Paper} sx={{ height: "100%", width: "100%", overflow: "auto" }}>
            <TableView docs={docs} rawDocs={rawDocs} />
          </TableContainer>
        </Box>
      </Container>
    </Box>
  );
}
