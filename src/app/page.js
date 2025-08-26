"use client";

import { useCallback, useMemo, useState, memo } from "react";
import Image from "next/image";
import { db } from "@/lib/firebase";
import {
  Timestamp,
  collection,
  getDocs,
  orderBy,
  query,
  where,
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
  function formatDateTimeLocal(d) {
    const pad = (n) => String(n).padStart(2, "0");
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `${y}-${m}-${day}T${hh}:${mm}:${ss}`;
  }
  const { start: defaultStart, end: defaultEnd } = (() => {
    const now = new Date();
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    const s = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0);
    const e = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59);
    return { start: formatDateTimeLocal(s), end: formatDateTimeLocal(e) };
  })();
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSearch = start && end;

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
      await onSearch(start, end);
    } catch (e) {
      setError(e?.message || "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, maxWidth: 720 }}>
        <TextField
          label="開始"
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          InputLabelProps={{ shrink: true }}
          inputProps={{ step: 1 }}
        />
        <TextField
          label="終了"
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          InputLabelProps={{ shrink: true }}
          inputProps={{ step: 1 }}
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
      <TableHead>
        <TableRow
          sx={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            backgroundImage:
              "linear-gradient(90deg, rgba(0, 0, 45, 1), rgba(12, 70, 79, 1))",
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
                backgroundColor: "transparent",
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

export default function Home() {
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

  const downloadCsv = useCallback(() => {
    const csv = toCsv(docs);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transfer_createdAt_${new Date()
      .toISOString()
      .slice(0, 19)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
            <Image src="/icon.png" alt="app icon" width={28} height={28} />
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
