import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { App as AntdApp, ConfigProvider, theme } from "antd";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { UserProvider } from "@/contexts/UserContext";
import "@/styles/globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Student XX-XXX-XXX",
  description: "sopra-fs26-template-client",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <div className="floating-bg" aria-hidden="true">
          {/* Math symbols */}
          <span className="float-shape" style={{ "--x": "5%",  "--y": "15%", "--size": "180px", "--shape-color": "rgba(91,108,255,0.12)",  "--dur": "18s", "--delay": "0s"  } as React.CSSProperties}>+</span>
          <span className="float-shape" style={{ "--x": "15%", "--y": "70%", "--size": "60px",  "--shape-color": "rgba(245,87,108,0.25)",  "--dur": "22s", "--delay": "-2s" } as React.CSSProperties}>%</span>
          <span className="float-shape" style={{ "--x": "25%", "--y": "30%", "--size": "140px", "--shape-color": "rgba(52,211,153,0.14)",  "--dur": "20s", "--delay": "-4s" } as React.CSSProperties}>△</span>
          <span className="float-shape" style={{ "--x": "35%", "--y": "85%", "--size": "90px",  "--shape-color": "rgba(168,85,247,0.22)",  "--dur": "24s", "--delay": "-1s" } as React.CSSProperties}>π</span>
          <span className="float-shape" style={{ "--x": "45%", "--y": "20%", "--size": "200px", "--shape-color": "rgba(251,191,36,0.10)",  "--dur": "19s", "--delay": "-3s" } as React.CSSProperties}>√</span>
          <span className="float-shape" style={{ "--x": "55%", "--y": "60%", "--size": "70px",  "--shape-color": "rgba(91,108,255,0.22)",  "--dur": "21s", "--delay": "-5s" } as React.CSSProperties}>○</span>
          <span className="float-shape" style={{ "--x": "65%", "--y": "40%", "--size": "160px", "--shape-color": "rgba(245,87,108,0.11)",  "--dur": "23s", "--delay": "-2s" } as React.CSSProperties}>Σ</span>
          <span className="float-shape" style={{ "--x": "75%", "--y": "75%", "--size": "72px",  "--shape-color": "rgba(59,130,246,0.25)",  "--dur": "17s", "--delay": "-4s" } as React.CSSProperties}>÷</span>
          <span className="float-shape" style={{ "--x": "85%", "--y": "25%", "--size": "100px", "--shape-color": "rgba(52,211,153,0.15)",  "--dur": "25s", "--delay": "-1s" } as React.CSSProperties}>□</span>
          <span className="float-shape" style={{ "--x": "92%", "--y": "55%", "--size": "80px",  "--shape-color": "rgba(168,85,247,0.22)",  "--dur": "20s", "--delay": "-3s" } as React.CSSProperties}>∫</span>
          <span className="float-shape" style={{ "--x": "10%", "--y": "45%", "--size": "220px", "--shape-color": "rgba(251,191,36,0.08)",  "--dur": "22s", "--delay": "-6s" } as React.CSSProperties}>×</span>
          <span className="float-shape" style={{ "--x": "30%", "--y": "55%", "--size": "66px",  "--shape-color": "rgba(59,130,246,0.25)",  "--dur": "19s", "--delay": "-7s" } as React.CSSProperties}>Δ</span>
          <span className="float-shape" style={{ "--x": "50%", "--y": "90%", "--size": "150px", "--shape-color": "rgba(245,87,108,0.12)",  "--dur": "26s", "--delay": "0s"  } as React.CSSProperties}>∞</span>
          <span className="float-shape" style={{ "--x": "70%", "--y": "10%", "--size": "100px", "--shape-color": "rgba(52,211,153,0.18)",  "--dur": "21s", "--delay": "-5s" } as React.CSSProperties}>▷</span>
          <span className="float-shape" style={{ "--x": "88%", "--y": "80%", "--size": "62px",  "--shape-color": "rgba(91,108,255,0.25)",  "--dur": "18s", "--delay": "-8s" } as React.CSSProperties}>=</span>
          <span className="float-shape" style={{ "--x": "40%", "--y": "5%",  "--size": "190px", "--shape-color": "rgba(168,85,247,0.09)",  "--dur": "23s", "--delay": "-2s" } as React.CSSProperties}>±</span>
          <span className="float-shape" style={{ "--x": "20%", "--y": "92%", "--size": "58px",  "--shape-color": "rgba(59,130,246,0.22)",  "--dur": "20s", "--delay": "-9s" } as React.CSSProperties}>α</span>
          <span className="float-shape" style={{ "--x": "60%", "--y": "35%", "--size": "100px", "--shape-color": "rgba(251,191,36,0.13)",  "--dur": "24s", "--delay": "-4s" } as React.CSSProperties}>≈</span>
          <span className="float-shape" style={{ "--x": "80%", "--y": "50%", "--size": "74px",  "--shape-color": "rgba(52,211,153,0.25)",  "--dur": "19s", "--delay": "-6s" } as React.CSSProperties}>∂</span>
          <span className="float-shape" style={{ "--x": "48%", "--y": "48%", "--size": "170px", "--shape-color": "rgba(91,108,255,0.10)",  "--dur": "27s", "--delay": "-1s" } as React.CSSProperties}>Ω</span>
          {/* Numbers */}
          <span className="float-shape" style={{ "--x": "8%",  "--y": "35%", "--size": "160px", "--shape-color": "rgba(245,87,108,0.10)",  "--dur": "21s", "--delay": "-3s" } as React.CSSProperties}>7</span>
          <span className="float-shape" style={{ "--x": "72%", "--y": "65%", "--size": "68px",  "--shape-color": "rgba(91,108,255,0.22)",  "--dur": "19s", "--delay": "-1s" } as React.CSSProperties}>3</span>
          <span className="float-shape" style={{ "--x": "42%", "--y": "78%", "--size": "200px", "--shape-color": "rgba(52,211,153,0.08)",  "--dur": "25s", "--delay": "-5s" } as React.CSSProperties}>9</span>
          <span className="float-shape" style={{ "--x": "90%", "--y": "15%", "--size": "82px",  "--shape-color": "rgba(168,85,247,0.20)",  "--dur": "20s", "--delay": "-7s" } as React.CSSProperties}>2</span>
          <span className="float-shape" style={{ "--x": "18%", "--y": "58%", "--size": "100px", "--shape-color": "rgba(251,191,36,0.15)",  "--dur": "23s", "--delay": "0s"  } as React.CSSProperties}>5</span>
          <span className="float-shape" style={{ "--x": "58%", "--y": "12%", "--size": "180px", "--shape-color": "rgba(59,130,246,0.09)",  "--dur": "18s", "--delay": "-4s" } as React.CSSProperties}>1</span>
          <span className="float-shape" style={{ "--x": "78%", "--y": "88%", "--size": "64px",  "--shape-color": "rgba(245,87,108,0.22)",  "--dur": "24s", "--delay": "-2s" } as React.CSSProperties}>8</span>
          <span className="float-shape" style={{ "--x": "33%", "--y": "8%",  "--size": "100px", "--shape-color": "rgba(52,211,153,0.14)",  "--dur": "22s", "--delay": "-6s" } as React.CSSProperties}>4</span>
          <span className="float-shape" style={{ "--x": "95%", "--y": "42%", "--size": "72px",  "--shape-color": "rgba(91,108,255,0.20)",  "--dur": "26s", "--delay": "-8s" } as React.CSSProperties}>6</span>
          <span className="float-shape" style={{ "--x": "52%", "--y": "52%", "--size": "140px", "--shape-color": "rgba(168,85,247,0.10)",  "--dur": "17s", "--delay": "-3s" } as React.CSSProperties}>0</span>
        </div>
        <ConfigProvider
          theme={{
            algorithm: theme.defaultAlgorithm,
            token: {
              // general theme options are set in token, meaning all primary elements (button, menu, ...) will have this color
              colorPrimary: "#5B6CFF",
              borderRadius: 8,
              colorText: "#1A1A2E",
              fontSize: 16,

              // Alias Token
              colorBgContainer: "#FFFFFF",
            },
            // if a component type needs special styling, setting here will override default options set in token
            components: {
              Button: {
                colorPrimary: "#5B6CFF",
                algorithm: true,
                controlHeight: 38,
              },
              Input: {
                colorBorder: "#EEF0F4",
                colorTextPlaceholder: "#9CA3AF",
                algorithm: false,
              },
              Form: {
                labelColor: "#6B7280",
                algorithm: theme.defaultAlgorithm,
              },
              Card: {},
            },
          }}
        >
          <AntdRegistry>
            <AntdApp>
              <UserProvider>{children}</UserProvider>
            </AntdApp>
          </AntdRegistry>
        </ConfigProvider>
      </body>
    </html>
  );
}
