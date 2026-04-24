"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const CATEGORIES = {
  dp: {
    label: "Línea DP y TE Air",
    minAnnualRate: 0.4,
    maxInstallments: 12,
    canFinanceVAT: false,
  },
  mx: {
    label: "Línea MX",
    minAnnualRate: 0.3,
    maxInstallments: 15,
    canFinanceVAT: true,
  },
  consonaN5: {
    label: "Línea Consona N5",
    minAnnualRate: 0.3,
    maxInstallments: 18,
    canFinanceVAT: true,
  },
  consonaN6: {
    label: "Línea Consona N6",
    minAnnualRate: 0.3,
    maxInstallments: 18,
    canFinanceVAT: true,
  },
  consonaN7: {
    label: "Línea Consona N7",
    minAnnualRate: 0.3,
    maxInstallments: 18,
    canFinanceVAT: true,
  },
  consonaN8: {
    label: "Línea Consona N8",
    minAnnualRate: 0.3,
    maxInstallments: 24,
    canFinanceVAT: true,
  },
  consonaN9: {
    label: "Línea Consona N9",
    minAnnualRate: 0.3,
    maxInstallments: 24,
    canFinanceVAT: true,
  },
  alta: {
    label: "Alta Gama",
    minAnnualRate: 0.25,
    maxInstallments: 24,
    canFinanceVAT: true,
  },
} as const;

const VAT_RATE = 0.16;
const IGTF_RATE = 0.03;
const MIN_INITIAL_RATE = 0.2;
const SUGGESTED_INITIAL_RATE = 0.25;
const ACCESS_PASSWORD = "BNH2026";

type PaymentMode = "si" | "no";

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return "$0.00";
  return new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function roundUpToNearest5(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / 5) * 5;
}

function formatNumberInput(value: number) {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(2);
}

function calculateIRR(cashFlows: number[]): number | null {
  if (cashFlows.length < 2) return null;

  const hasPositive = cashFlows.some((v) => v > 0);
  const hasNegative = cashFlows.some((v) => v < 0);
  if (!hasPositive || !hasNegative) return null;

  const npv = (rate: number) =>
    cashFlows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + rate, i), 0);

  let low = -0.9999;
  let high = 10;
  let npvLow = npv(low);
  let npvHigh = npv(high);

  if (!Number.isFinite(npvLow) || !Number.isFinite(npvHigh)) return null;

  let attempts = 0;
  while (npvLow * npvHigh > 0 && attempts < 60) {
    high *= 2;
    npvHigh = npv(high);
    if (!Number.isFinite(npvHigh)) return null;
    attempts++;
  }

  if (npvLow * npvHigh > 0) return null;

  for (let i = 0; i < 250; i++) {
    const mid = (low + high) / 2;
    const npvMid = npv(mid);

    if (!Number.isFinite(npvMid)) return null;
    if (Math.abs(npvMid) < 1e-10) return mid;

    if (npvLow * npvMid < 0) {
      high = mid;
    } else {
      low = mid;
      npvLow = npvMid;
    }
  }

  return (low + high) / 2;
}

function monthlyIrrToAnnual(irr: number | null) {
  if (irr === null || !Number.isFinite(irr)) return null;
  return Math.pow(1 + irr, 12) - 1;
}

function buildCashFlows(params: {
  commercialPrice: number;
  initialAmount: number;
  installments: number;
  monthlyPayment: number;
  ivaFinancing: PaymentMode;
  ivaAmount: number;
}) {
  const {
    commercialPrice,
    initialAmount,
    installments,
    monthlyPayment,
    ivaFinancing,
    ivaAmount,
  } = params;

  const flow0 = -commercialPrice + initialAmount;

  // Nueva lógica:
  // Sí = I.V.A. financiado dentro de las cuotas normales.
  // No = I.V.A. pagado por fuera en el primer pago, pero sin sumar pagos adicionales.
  if (ivaFinancing === "si") {
    return [flow0, ...Array.from({ length: installments }, () => monthlyPayment)];
  }

  return [
    flow0,
    ivaAmount,
    ...Array.from({ length: Math.max(installments - 1, 0) }, () => monthlyPayment),
  ];
}

function findMinimumMonthlyPayment(params: {
  commercialPrice: number;
  initialAmount: number;
  installments: number;
  targetAnnualRate: number;
  ivaFinancing: PaymentMode;
  ivaAmount: number;
}) {
  const {
    commercialPrice,
    initialAmount,
    installments,
    targetAnnualRate,
    ivaFinancing,
    ivaAmount,
  } = params;

  const financedAmount = commercialPrice - initialAmount;
  const normalPaymentCount = ivaFinancing === "si" ? installments : installments - 1;

  if (
    !Number.isFinite(financedAmount) ||
    financedAmount <= 0 ||
    !Number.isInteger(installments) ||
    installments <= 0 ||
    normalPaymentCount <= 0
  ) {
    return {
      rawMonthlyPayment: 0,
      roundedMonthlyPayment: 0,
      monthlyIrr: null as number | null,
      annualIrr: null as number | null,
    };
  }

  const getAnnualIrrFromPayment = (payment: number) => {
    const cashFlows = buildCashFlows({
      commercialPrice,
      initialAmount,
      installments,
      monthlyPayment: payment,
      ivaFinancing,
      ivaAmount,
    });

    const irr = calculateIRR(cashFlows);
    const annual = monthlyIrrToAnnual(irr);
    return { irr, annual };
  };

  let low = 0;
  let high = Math.max(financedAmount * 2, 1000);

  let highResult = getAnnualIrrFromPayment(high);
  let attempts = 0;

  while (
    (highResult.annual === null || highResult.annual < targetAnnualRate) &&
    attempts < 100
  ) {
    high *= 2;
    highResult = getAnnualIrrFromPayment(high);
    attempts++;
  }

  if (highResult.annual === null || highResult.annual < targetAnnualRate) {
    return {
      rawMonthlyPayment: 0,
      roundedMonthlyPayment: 0,
      monthlyIrr: null,
      annualIrr: null,
    };
  }

  for (let i = 0; i < 250; i++) {
    const mid = (low + high) / 2;
    const result = getAnnualIrrFromPayment(mid);

    if (result.annual === null) {
      low = mid;
      continue;
    }

    if (result.annual >= targetAnnualRate) {
      high = mid;
    } else {
      low = mid;
    }
  }

  const rawMonthlyPayment = high;
  let roundedMonthlyPayment = roundUpToNearest5(rawMonthlyPayment);

  let finalResult = getAnnualIrrFromPayment(roundedMonthlyPayment);

  while (finalResult.annual !== null && finalResult.annual < targetAnnualRate) {
    roundedMonthlyPayment += 5;
    finalResult = getAnnualIrrFromPayment(roundedMonthlyPayment);
  }

  return {
    rawMonthlyPayment,
    roundedMonthlyPayment,
    monthlyIrr: finalResult.irr,
    annualIrr: finalResult.annual,
  };
}

export default function Page() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [accessError, setAccessError] = useState("");

  const handleLogin = () => {
    if (password === ACCESS_PASSWORD) {
      setIsAuthenticated(true);
      setAccessError("");
    } else {
      setAccessError("Clave incorrecta.");
    }
  };

  if (!isAuthenticated) {
    return (
      <div
        className="min-h-screen bg-[#f3f5f7] px-6 py-10"
        style={{ fontFamily: "Verdana, sans-serif" }}
      >
        <div className="mx-auto flex max-w-md flex-col items-center justify-center">
          <div className="mb-8 flex justify-center">
            <Image
              src="/logo-bnh.jpg"
              alt="BNH Medical"
              width={360}
              height={180}
              className="h-auto w-[280px] md:w-[340px]"
              priority
            />
          </div>

          <Card className="w-full rounded-3xl border-0 bg-white shadow-lg ring-1 ring-gray-200">
            <CardHeader className="pb-2 text-center">
              <CardTitle className="text-3xl font-bold text-gray-900">
                Acceso privado
              </CardTitle>
              <p className="mt-2 text-sm text-gray-600">
                Ingrese la clave para acceder a la calculadora de financiamiento
              </p>
            </CardHeader>

            <CardContent className="space-y-5 pt-4">
              <div className="space-y-3">
                <Label className="block text-base font-medium text-gray-800">
                  Clave de acceso
                </Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingrese su clave"
                  className="h-12 rounded-xl"
                />
              </div>

              {accessError && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertDescription>{accessError}</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleLogin}
                className="h-12 w-full rounded-xl bg-[#0d6f91] text-base font-semibold hover:bg-[#0a607d]"
              >
                Ingresar
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return <CalculadoraFinanciamientoBNH />;
}

function CalculadoraFinanciamientoBNH() {
  const [category, setCategory] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [initialAmount, setInitialAmount] = useState("");
  const [ivaFinancing, setIvaFinancing] = useState<PaymentMode>("no");
  const [installments, setInstallments] = useState("");

  const categoryConfig =
    category && category in CATEGORIES
      ? CATEGORIES[category as keyof typeof CATEGORIES]
      : null;

  const numericBase = Number(basePrice);
  const numericInitial = Number(initialAmount);
  const numericInstallments = Number(installments);

  const minInitialAmount = useMemo(() => {
    const safeBase = Number.isFinite(numericBase) && numericBase > 0 ? numericBase : 0;
    return safeBase * MIN_INITIAL_RATE;
  }, [numericBase]);

  const suggestedInitialAmount = useMemo(() => {
    const safeBase = Number.isFinite(numericBase) && numericBase > 0 ? numericBase : 0;
    return safeBase * SUGGESTED_INITIAL_RATE;
  }, [numericBase]);

  const vatAmount = useMemo(() => {
    const safeBase = Number.isFinite(numericBase) && numericBase > 0 ? numericBase : 0;
    return safeBase * VAT_RATE;
  }, [numericBase]);

  const totalWithVat = useMemo(() => {
    const safeBase = Number.isFinite(numericBase) && numericBase > 0 ? numericBase : 0;
    return safeBase + vatAmount;
  }, [numericBase, vatAmount]);

  const igtfAmount = useMemo(() => {
    return totalWithVat * IGTF_RATE;
  }, [totalWithVat]);

  const commercialPrice = useMemo(() => {
    return totalWithVat + igtfAmount;
  }, [totalWithVat, igtfAmount]);

  useEffect(() => {
    if (!categoryConfig) {
      setIvaFinancing("no");
      return;
    }

    if (categoryConfig.canFinanceVAT) {
      setIvaFinancing("si");
    } else {
      setIvaFinancing("no");
    }
  }, [categoryConfig]);

  useEffect(() => {
    if (categoryConfig && Number.isFinite(numericBase) && numericBase > 0) {
      setInitialAmount(formatNumberInput(minInitialAmount));
    } else if (!basePrice) {
      setInitialAmount("");
    }
  }, [categoryConfig, numericBase, minInitialAmount, basePrice]);

  const validations = useMemo(() => {
    const errors: string[] = [];

    if (!categoryConfig) return errors;

    if (basePrice !== "" && (!Number.isFinite(numericBase) || numericBase <= 0)) {
      errors.push("No válido: la base imponible debe ser mayor a cero.");
    }

    if (initialAmount !== "" && (!Number.isFinite(numericInitial) || numericInitial < 0)) {
      errors.push("No válido: el monto inicial debe ser un valor numérico válido.");
    }

    if (
      installments !== "" &&
      (!Number.isInteger(numericInstallments) || numericInstallments <= 0)
    ) {
      errors.push("No válido: la cantidad de cuotas debe ser un entero mayor a cero.");
    }

    if (
      Number.isFinite(numericBase) &&
      numericBase > 0 &&
      Number.isFinite(numericInitial) &&
      numericInitial < minInitialAmount
    ) {
      errors.push("No válido: la inicial debe ser al menos 20% de la base imponible.");
    }

    if (
      installments !== "" &&
      Number.isInteger(numericInstallments) &&
      numericInstallments > categoryConfig.maxInstallments
    ) {
      errors.push("No válido: la cantidad de cuotas excede el máximo permitido.");
    }

    if (!categoryConfig.canFinanceVAT && ivaFinancing === "si") {
      errors.push("No válido: esta categoría no permite financiamiento del I.V.A.");
    }

    if (ivaFinancing === "no" && Number.isInteger(numericInstallments) && numericInstallments <= 1) {
      errors.push("No válido: si el I.V.A. no se financia, debe existir al menos una cuota posterior.");
    }

    return errors;
  }, [
    categoryConfig,
    basePrice,
    initialAmount,
    installments,
    ivaFinancing,
    numericBase,
    numericInitial,
    numericInstallments,
    minInitialAmount,
  ]);

  const calculations = useMemo(() => {
    const safeBase = Number.isFinite(numericBase) && numericBase > 0 ? numericBase : 0;
    const safeInitial =
      Number.isFinite(numericInitial) && numericInitial >= 0 ? numericInitial : 0;
    const safeInstallments =
      Number.isInteger(numericInstallments) && numericInstallments > 0
        ? numericInstallments
        : 0;

    const safeCommercialPrice = safeBase > 0 ? commercialPrice : 0;
    const safeVat = safeBase > 0 ? vatAmount : 0;

    if (!categoryConfig || safeCommercialPrice <= 0 || safeInstallments <= 0) {
      return {
        roundedMonthlyPayment: 0,
        totalToPay: safeInitial,
        ivaToPayField: ivaFinancing === "no" ? safeVat : 0,
        monthlyIrr: null as number | null,
        annualIrr: null as number | null,
      };
    }

    const search = findMinimumMonthlyPayment({
      commercialPrice: safeCommercialPrice,
      initialAmount: safeInitial,
      installments: safeInstallments,
      targetAnnualRate: categoryConfig.minAnnualRate,
      ivaFinancing,
      ivaAmount: safeVat,
    });

    const normalPaymentCount = ivaFinancing === "si" ? safeInstallments : safeInstallments - 1;
    const normalPaymentsTotal =
      search.roundedMonthlyPayment * Math.max(normalPaymentCount, 0);

    const ivaSeparate = ivaFinancing === "no" ? safeVat : 0;
    const totalToPay = safeInitial + ivaSeparate + normalPaymentsTotal;

    return {
      roundedMonthlyPayment: search.roundedMonthlyPayment,
      totalToPay,
      ivaToPayField: ivaSeparate,
      monthlyIrr: search.monthlyIrr,
      annualIrr: search.annualIrr,
    };
  }, [
    numericBase,
    numericInitial,
    numericInstallments,
    commercialPrice,
    vatAmount,
    ivaFinancing,
    categoryConfig,
  ]);

  const isValid =
    !!categoryConfig &&
    Number.isFinite(numericBase) &&
    numericBase > 0 &&
    Number.isFinite(numericInitial) &&
    numericInitial >= minInitialAmount &&
    Number.isInteger(numericInstallments) &&
    numericInstallments > 0 &&
    numericInstallments <= categoryConfig.maxInstallments &&
    validations.length === 0 &&
    calculations.roundedMonthlyPayment > 0 &&
    calculations.annualIrr !== null &&
    calculations.annualIrr >= categoryConfig.minAnnualRate;

  const handleReset = () => {
    setCategory("");
    setBasePrice("");
    setInitialAmount("");
    setIvaFinancing("no");
    setInstallments("");
  };

  return (
    <div
      className="min-h-screen bg-[#f3f5f7] px-4 py-6 md:px-6 md:py-8"
      style={{ fontFamily: "Verdana, sans-serif" }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 bg-transparent md:mb-8">
          <div className="flex flex-col items-center gap-5 text-center md:flex-row md:items-center md:text-left">
            <Image
              src="/logo-bnh.jpg"
              alt="BNH Medical"
              width={240}
              height={120}
              className="h-auto w-[190px] md:w-[220px]"
              priority
            />

            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
                Calculadora de Financiamiento
              </h1>
              <p className="mt-2 text-sm text-gray-600 md:text-base">
                Simulación comercial para planes de financiamiento
              </p>

              <div className="mt-4 inline-flex rounded-full bg-[#0d6f91]/10 px-4 py-2 text-sm font-medium text-[#0d6f91]">
                BNH Medical · Herramienta interna
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-3xl border-0 shadow-sm ring-1 ring-gray-200">
            <CardHeader>
              <CardTitle className="text-2xl text-gray-900">
                Datos de la operación
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label className="mb-2 block">Categoría</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Seleccione una categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIES).map(([key, value]) => (
                      <SelectItem key={key} value={key}>
                        {value.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-2 block">Base imponible</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  placeholder="Ej. 10000"
                  className="rounded-xl"
                />
              </div>

              <div>
                <Label className="mb-2 block">Monto inicial</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={initialAmount}
                  onChange={(e) => setInitialAmount(e.target.value)}
                  placeholder="Ej. 2500"
                  className="rounded-xl"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Inicial sugerida 25%: {formatCurrency(suggestedInitialAmount)}
                </p>
              </div>

              <div>
                <Label className="mb-2 block">Financiamiento del I.V.A.</Label>
                <Select
                  value={ivaFinancing}
                  onValueChange={(value: PaymentMode) => setIvaFinancing(value)}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Seleccione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    {categoryConfig?.canFinanceVAT ? (
                      <SelectItem value="si">Sí</SelectItem>
                    ) : (
                      <SelectItem value="si" disabled>
                        Sí
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-2 block">Cantidad de cuotas</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={installments}
                  onChange={(e) => setInstallments(e.target.value)}
                  placeholder="Ej. 12"
                  className="rounded-xl"
                />
                <p className="mt-2 text-xs text-gray-500">
                  {categoryConfig
                    ? `Máximo permitido: ${categoryConfig.maxInstallments} cuotas`
                    : "Seleccione una categoría para ver el máximo permitido"}
                </p>
              </div>

              {validations.length > 0 && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertDescription>
                    <div className="space-y-1">
                      {validations.map((message, index) => (
                        <div key={index}>{message}</div>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <Button
                variant="outline"
                onClick={handleReset}
                className="rounded-xl border-gray-300"
              >
                Restablecer
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-0 shadow-sm ring-1 ring-gray-200">
            <CardHeader>
              <CardTitle className="text-2xl text-gray-900">Resultados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 rounded-3xl bg-[#0b0b0b] p-8 text-white shadow-lg">
                <p className="text-base font-medium text-gray-300">Cuota mensual</p>
                <p className="mt-3 text-5xl font-extrabold tracking-tight md:text-6xl">
                  {isValid ? formatCurrency(calculations.roundedMonthlyPayment) : "$0.00"}
                </p>
                <p className="mt-4 text-sm font-medium text-gray-300">
                  Total de pagos:{" "}
                  <span className="font-bold text-white">
                    {isValid ? numericInstallments : 0}
                  </span>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <Item
                  label="Cantidad de cuotas"
                  value={String(isValid ? numericInstallments : 0)}
                />
                <Item label="Monto de inicial" value={formatCurrency(numericInitial || 0)} />
                <Item
                  label="I.V.A. a pagar en Bs"
                  value={formatCurrency(calculations.ivaToPayField)}
                />
                <Item label="Total a pagar" value={formatCurrency(calculations.totalToPay)} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-gray-500">{label}</p>
      <p className="mt-1 font-semibold text-gray-900">{value}</p>
    </div>
  );
}