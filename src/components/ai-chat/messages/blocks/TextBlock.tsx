"use client";

import React, { memo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import "katex/dist/katex.min.css";

interface TextBlockProps {
  content: string;
  isStreaming?: boolean;
}

function TextBlockImpl({ content }: TextBlockProps) {
  const components: Components = {
    // Code blocks
    code: ({
      children,
      className,
      ...props
    }: {
      children?: React.ReactNode;
      className?: string;
    }) => {
      const match = /language-(\w+)/.exec(className ?? "");
      const language = match?.[1] ?? "text";
      const childrenArray = React.Children.toArray(children ?? []);
      const value = childrenArray
        .map((child) => (typeof child === "string" ? child : ""))
        .join("")
        .replace(/\n$/, "");

      // Code block (with language or multiline)
      const isCodeBlock = Boolean(match) || value.includes("\n");

      if (isCodeBlock) {
        return (
          <div className="my-2 rounded-lg overflow-hidden border border-border">
            <SyntaxHighlighter
              language={language}
              style={vscDarkPlus}
              customStyle={{
                margin: 0,
                padding: "1rem",
                fontSize: "0.875rem",
              }}
            >
              {value}
            </SyntaxHighlighter>
          </div>
        );
      }

      // Inline code
      return (
        <code
          className="rounded bg-muted px-1.5 py-0.5 text-[0.875em] font-mono"
          style={{ overflowWrap: "anywhere", wordBreak: "normal" }}
          {...props}
        >
          {children}
        </code>
      );
    },
    pre: ({ children }) => <>{children}</>,
    // Links
    a: ({ children, href, ...props }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline font-sans text-blue-600 underline decoration-blue-600/40 underline-offset-2 hover:text-blue-700 hover:decoration-blue-700/60 transition-colors"
        style={{ overflowWrap: "anywhere" }}
        {...props}
      >
        {children}
      </a>
    ),
    // Paragraphs
    p: ({ children, ...props }) => (
      <p
        className="my-3 first:mt-0 last:mb-0 font-sans text-[15px] leading-[1.7]"
        style={{ overflowWrap: "anywhere", wordBreak: "normal" }}
        {...props}
      >
        {children}
      </p>
    ),
    // Headings
    h1: ({ children, ...props }) => (
      <h1
        className="mt-6 mb-3 first:mt-0 font-sans text-2xl font-semibold leading-tight"
        {...props}
      >
        {children}
      </h1>
    ),
    h2: ({ children, ...props }) => (
      <h2
        className="mt-5 mb-3 first:mt-0 font-sans text-xl font-semibold leading-tight"
        {...props}
      >
        {children}
      </h2>
    ),
    h3: ({ children, ...props }) => (
      <h3
        className="mt-4 mb-2 first:mt-0 font-sans text-lg font-semibold leading-snug"
        {...props}
      >
        {children}
      </h3>
    ),
    // Lists
    ul: ({ children, ...props }) => (
      <ul
        className="my-3 pl-6 font-sans text-[15px] leading-[1.7] list-disc"
        {...props}
      >
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol
        className="my-3 pl-6 font-sans text-[15px] leading-[1.7] list-decimal"
        {...props}
      >
        {children}
      </ol>
    ),
    li: ({ children, ...props }) => <li className="my-1" {...props}>{children}</li>,
    // Blockquote
    blockquote: ({ children, ...props }) => (
      <blockquote
        className="my-3 border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground"
        {...props}
      >
        {children}
      </blockquote>
    ),
    // Tables
    table: ({ children, ...props }) => (
      <div className="my-4 max-w-full overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse font-sans text-[14px]" {...props}>
          {children}
        </table>
      </div>
    ),
    thead: ({ children, ...props }) => (
      <thead className="bg-muted/50" {...props}>
        {children}
      </thead>
    ),
    tr: ({ children, ...props }) => (
      <tr className="border-b border-border last:border-0" {...props}>
        {children}
      </tr>
    ),
    th: ({ children, ...props }) => (
      <th className="px-4 py-2 text-left font-semibold" {...props}>
        {children}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td className="px-4 py-2" {...props}>
        {children}
      </td>
    ),
  };

  return (
    <div className="w-full min-w-0">
      <div className="max-w-full overflow-x-hidden">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
          rehypePlugins={[
            [
              rehypeKatex,
              {
                throwOnError: false,
                errorColor: "#cc0000",
                strict: false,
              },
            ],
          ]}
          components={components}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export const TextBlock = memo(TextBlockImpl);

