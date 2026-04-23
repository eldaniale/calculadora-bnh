"use client";

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
    canFinanceVAT: false,
  },
  consona: {
    label: "Línea Consona N",
    minAnnualRate: 0.3,
    maxInstallments: 18,
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

  if (ivaFinancing === "si") {
    return [
      flow0,
      ivaAmount,
      ...Array.from({ length: installments }, () => monthlyPayment),
    ];
  }

  return [flow0, ...Array.from({ length: installments }, () => monthlyPayment)];
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

  if (
    !Number.isFinite(financedAmount) ||
    financedAmount <= 0 ||
    !Number.isInteger(installments) ||
    installments <= 0
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
        className="flex min-h-screen items-center justify-center bg-gray-100 p-6"
        style={{ fontFamily: "Verdana, sans-serif" }}
      >
        <Card className="w-full max-w-md rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-3xl font-bold text-gray-900">
              Acceso privado
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-5 pt-2">
            <div className="space-y-3">
              <Label className="block text-base font-medium text-gray-800">
                Ingrese la clave
              </Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Clave de acceso"
                className="h-12"
              />
            </div>

            {accessError && (
              <Alert className="border-red-200 bg-red-50">
                <AlertDescription>{accessError}</AlertDescription>
              </Alert>
            )}

            <Button onClick={handleLogin} className="h-12 w-full text-base font-semibold">
              Ingresar
            </Button>
          </CardContent>
        </Card>
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
      errors.push("No válido: esta categoría no permite financiamiento de IVA.");
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
        ivaToPayField: ivaFinancing === "si" ? safeVat : 0,
        monthlyIrr: null as number | null,
        annualIrr: null as number | null,
        totalDisplayedInstallments:
          ivaFinancing === "si" ? safeInstallments + 1 : safeInstallments,
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

    const normalPaymentsTotal = search.roundedMonthlyPayment * safeInstallments;
    const ivaSeparate = ivaFinancing === "si" ? safeVat : 0;
    const totalToPay = safeInitial + ivaSeparate + normalPaymentsTotal;

    return {
      roundedMonthlyPayment: search.roundedMonthlyPayment,
      totalToPay,
      ivaToPayField: ivaSeparate,
      monthlyIrr: search.monthlyIrr,
      annualIrr: search.annualIrr,
      totalDisplayedInstallments:
        ivaFinancing === "si" ? safeInstallments + 1 : safeInstallments,
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
      className="min-h-screen bg-gray-100 p-6"
      style={{ fontFamily: "Verdana, sans-serif" }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-gray-900">
            Calculadora de Financiamiento
          </h1>
          <p className="text-sm text-gray-600">
            Simulación comercial para planes de financiamiento
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Datos de la operación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label className="mb-2 block">Categoría</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
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
                />
                <p className="mt-2 text-xs text-gray-500">
                  Inicial requerida 25%: {formatCurrency(suggestedInitialAmount)}
                </p>
              </div>

              <div>
                <Label className="mb-2 block">Financiamiento de IVA</Label>
                <Select
                  value={ivaFinancing}
                  onValueChange={(value: PaymentMode) => setIvaFinancing(value)}
                >
                  <SelectTrigger>
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

              <Button variant="outline" onClick={handleReset}>
                Restablecer
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Resultados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 rounded-2xl bg-black p-8 text-white shadow-lg">
                <p className="text-base font-medium text-gray-300">Cuota mensual</p>
                <p className="mt-2 text-5xl font-extrabold tracking-tight">
                  {isValid ? formatCurrency(calculations.roundedMonthlyPayment) : "$0.00"}
                </p>
                <p className="mt-3 text-sm font-medium text-gray-300">
                  Total de pagos:{" "}
                  <span className="font-bold text-white">
                    {isValid ? calculations.totalDisplayedInstallments : 0}
                  </span>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <Item
                  label="Cantidad de cuotas"
                  value={String(isValid ? calculations.totalDisplayedInstallments : 0)}
                />
                <Item label="Monto de inicial" value={formatCurrency(numericInitial || 0)} />
                <Item label="IVA a pagar en Bs" value={formatCurrency(calculations.ivaToPayField)} />
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
    <div className="rounded-xl border bg-white p-4">
      <p className="text-gray-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}