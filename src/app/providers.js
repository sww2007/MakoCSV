"use client";

import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { jaJP } from "@mui/x-date-pickers/locales";
import "dayjs/locale/ja";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1e88e5" },
    secondary: { main: "#6d4c41" },
    background: { default: "#f5f7fb", paper: "#ffffff" },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          minHeight: "100vh",
          backgroundImage:
            "radial-gradient(1000px 400px at 10% 0%, #e8f2ff, transparent), radial-gradient(800px 300px at 100% 0%, #ffeef3, transparent)",
          backgroundRepeat: "no-repeat",
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 2 },
    },
  },
});

export default function Providers({ children }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LocalizationProvider
        dateAdapter={AdapterDayjs}
        adapterLocale="ja"
        localeText={jaJP.components.MuiLocalizationProvider.defaultProps.localeText}
      >
        {children}
      </LocalizationProvider>
    </ThemeProvider>
  );
}
