import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c06f43]/40 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[#173b3a] text-[#f8f6f0] shadow-[0_4px_12px_rgba(23,59,58,.16)] hover:-translate-y-0.5 hover:bg-[#245654]",
        destructive: "bg-[#b34f3d] text-white hover:bg-[#943f31]",
        outline: "border border-[#c9c8bd] bg-[#fffdf8] text-[#25413f] hover:border-[#173b3a] hover:bg-[#f5f1e7]",
        ghost: "text-[#49615e] hover:bg-[#e8e6dc] hover:text-[#173b3a]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-[#d9d8ce] bg-[#fffdf8] shadow-[0_10px_30px_rgba(43,53,48,.05)]", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-semibold leading-none tracking-tight text-[#173b3a]", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-lg border border-[#c9c8bd] bg-[#fffdf8] px-3 py-1 text-sm shadow-sm focus-visible:border-[#c06f43] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c06f43]/20 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-lg border border-[#c9c8bd] bg-[#fffdf8] px-3 py-2 text-sm shadow-sm focus-visible:border-[#c06f43] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c06f43]/20",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-semibold uppercase tracking-[0.12em] text-[#60716d]", className)} {...props} />;
}

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "border-transparent bg-slate-900 text-slate-50",
        secondary: "border-transparent bg-slate-100 text-slate-900",
        success: "border-transparent bg-green-100 text-green-900",
        destructive: "border-transparent bg-red-100 text-red-900",
        warning: "border-transparent bg-amber-100 text-amber-900",
        outline: "text-slate-950",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function classificationVariant(level: string): "default" | "secondary" | "success" | "destructive" | "warning" | "outline" {
  switch (level) {
    case "TOP SECRET":
      return "destructive";
    case "SECRET":
      return "warning";
    case "CONFIDENTIAL":
      return "default";
    case "RESTRICTED":
      return "secondary";
    default:
      return "outline";
  }
}
