"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  sectionName: string;
  fallbackTitle?: string;
  retryLabel?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || "Unexpected rendering error",
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[ErrorBoundary] UI section crashed:", {
      sectionName: this.props.sectionName,
      error: error.message,
      componentStack: errorInfo.componentStack,
    });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: "" });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center rounded-xl border border-red-500/30 bg-red-950/20 p-6 text-center text-red-200"
        >
          <AlertTriangle className="mb-2 h-8 w-8 text-red-400" />
          <h3 className="text-sm font-semibold">
            {this.props.fallbackTitle ?? "Something went wrong in this panel"}
          </h3>
          <p className="mt-1 text-xs text-red-300/80">
            {this.state.errorMessage}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-500/30"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {this.props.retryLabel ?? "Reload component"}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
