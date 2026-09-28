import type { Metadata } from "next";
import { Be_Vietnam_Pro, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { SSOProvider } from "@/components/SSOProvider";
import { CleanupAttributes } from "@/components/CleanupAttributes";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const beVietnam = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "BioKama - Online Learning Platform | Nền tảng học tập trực tuyến",
  description: "Online learning platform with AI | Nền tảng học tập trực tuyến với AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function removeBrowserExtensionAttributes() {
                  const attributesToRemove = ['bis_skin_checked', 'bis_register'];
                  const regexPatterns = [/^__processed_.*__$/];
                  
                  function removeFromElement(el) {
                    attributesToRemove.forEach(function(attr) {
                      if (el.hasAttribute && el.hasAttribute(attr)) {
                        el.removeAttribute(attr);
                      }
                    });
                    if (el.attributes) {
                      Array.from(el.attributes).forEach(function(attr) {
                        regexPatterns.forEach(function(pattern) {
                          if (pattern.test(attr.name)) {
                            el.removeAttribute(attr.name);
                          }
                        });
                      });
                    }
                  }
                  
                  function cleanup() {
                    var all = document.querySelectorAll('*');
                    for (var i = 0; i < all.length; i++) {
                      removeFromElement(all[i]);
                    }
                    if (document.body) removeFromElement(document.body);
                    if (document.documentElement) removeFromElement(document.documentElement);
                  }
                  
                  if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', cleanup);
                  } else {
                    cleanup();
                  }
                  
                  setInterval(cleanup, 200);
                  
                  if (window.MutationObserver) {
                    var observer = new MutationObserver(function(mutations) {
                      mutations.forEach(function(mutation) {
                        mutation.addedNodes.forEach(function(node) {
                          if (node.nodeType === 1) {
                            removeFromElement(node);
                            var children = node.querySelectorAll('*');
                            for (var i = 0; i < children.length; i++) {
                              removeFromElement(children[i]);
                            }
                          }
                        });
                        if (mutation.type === 'attributes' && mutation.target.nodeType === 1) {
                          removeFromElement(mutation.target);
                        }
                      });
                    });
                    if (document.body) {
                      observer.observe(document.body, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        attributeFilter: ['bis_skin_checked', 'bis_register']
                      });
                    }
                    if (document.documentElement) {
                      observer.observe(document.documentElement, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        attributeFilter: ['bis_skin_checked', 'bis_register']
                      });
                    }
                  }
                }
                removeBrowserExtensionAttributes();
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${beVietnam.variable} ${beVietnam.className} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <CleanupAttributes />
        <LanguageProvider>
          <AuthProvider>
            <SSOProvider>
              {children}
            </SSOProvider>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
