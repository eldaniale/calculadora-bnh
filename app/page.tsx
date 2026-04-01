"use client";

import React, { useMemo, useState } from "react";
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
  dp: { label: "Línea DP", minRate: 40, maxInstallments: 12 },
  portatiles: { label: "Portátiles", minRate: 30, maxInstallments: 15 },
  media: { label: "Media Gama", minRate: 30, maxInstallments: 18 },
  alta: { label: "Alta Gama", minRate: 25, maxInstallments: 24 },
};

const IVA_RATE = 0.16;
const MIN_INITIAL_RATE = 0.25;
const ACCESS_PASSWORD = "BNH2026";

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return "$0.00";
  return new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0.00%";
  return `${value.toFixed(2)}%`;
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
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
        <Card className="w-full max-w-md rounded-2xl">
          <CardHeader>
            <CardTitle>Acceso privado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Ingrese la clave</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Clave de acceso"
              />
            </div>

            {accessError && (
              <Alert className="border-red-200 bg-red-50">
                <AlertDescription>{accessError}</AlertDescription>
              </Alert>
            )}

            <Button onClick={handleLogin} className="w-full">
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
  const [rate, setRate] = useState("");
  const [installments, setInstallments] = useState("");

  const categoryConfig =
    category && category in CATEGORIES
      ? CATEGORIES[category as keyof typeof CATEGORIES]
      : null;

  const numericBase = Number(basePrice);
  const numericInitial = Number(initialAmount);
  const numericRate = Number(rate);
  const numericInstallments = Number(installments);

  const calculations = useMemo(() => {
    const safeBase = Number.isFinite(numericBase) && numericBase > 0 ? numericBase : 0;
    const safeInitial =
      Number.isFinite(numericInitial) && numericInitial >= 0 ? numericInitial : 0;
    const safeRate = Number.isFinite(numericRate) && numericRate >= 0 ? numericRate : 0;
    const safeInstallments =
      Number.isInteger(numericInstallments) && numericInstallments > 0
        ? numericInstallments
        : 0;

    const minInitialAmount = safeBase * MIN_INITIAL_RATE;
    const initialPercentage = safeBase > 0 ? (safeInitial / safeBase) * 100 : 0;
    const ivaAmount = safeBase * IVA_RATE;
    const financedAmount = Math.max(safeBase - safeInitial, 0);
    const totalInterest = financedAmount * (safeRate / 100);
    const totalToPay = financedAmount + totalInterest;
    const monthlyPayment = safeInstallments > 0 ? totalToPay / safeInstallments : 0;

    return {
      minInitialAmount,
      initialPercentage,
      ivaAmount,
      financedAmount,
      totalInterest,
      totalToPay,
      monthlyPayment,
    };
  }, [numericBase, numericInitial, numericRate, numericInstallments]);

  const validations = useMemo(() => {
    const errors: string[] = [];

    if (!categoryConfig) return errors;

    if (basePrice !== "" && (!Number.isFinite(numericBase) || numericBase <= 0)) {
      errors.push("No válido: la base imponible debe ser mayor a cero.");
    }

    if (initialAmount !== "" && (!Number.isFinite(numericInitial) || numericInitial < 0)) {
      errors.push("No válido: el monto inicial debe ser un valor numérico válido.");
    }

    if (rate !== "" && (!Number.isFinite(numericRate) || numericRate < 0)) {
      errors.push("No válido: la tasa debe ser un valor numérico válido.");
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
      numericInitial < calculations.minInitialAmount
    ) {
      errors.push("No válido: la inicial debe ser al menos 25% de la base imponible.");
    }

    if (
      rate !== "" &&
      Number.isFinite(numericRate) &&
      numericRate < categoryConfig.minRate
    ) {
      errors.push("No válido: la tasa es menor a la mínima permitida.");
    }

    if (
      installments !== "" &&
      Number.isInteger(numericInstallments) &&
      numericInstallments > categoryConfig.maxInstallments
    ) {
      errors.push("No válido: la cantidad de cuotas excede el máximo permitido.");
    }

    return errors;
  }, [
    categoryConfig,
    basePrice,
    initialAmount,
    rate,
    installments,
    numericBase,
    numericInitial,
    numericRate,
    numericInstallments,
    calculations.minInitialAmount,
  ]);

  const isValid =
    !!categoryConfig &&
    Number.isFinite(numericBase) &&
    numericBase > 0 &&
    Number.isFinite(numericInitial) &&
    numericInitial >= calculations.minInitialAmount &&
    Number.isFinite(numericRate) &&
    numericRate >= categoryConfig.minRate &&
    Number.isInteger(numericInstallments) &&
    numericInstallments > 0 &&
    numericInstallments <= categoryConfig.maxInstallments &&
    validations.length === 0;

  const handleReset = () => {
    setCategory("");
    setBasePrice("");
    setInitialAmount("");
    setRate("");
    setInstallments("");
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
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
            <CardContent className="space-y-4">
              <div>
                <Label>Categoría</Label>
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
                <Label>Base imponible</Label>
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
                <Label>Monto inicial</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={initialAmount}
                  onChange={(e) => setInitialAmount(e.target.value)}
                  placeholder="Ej. 2500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Monto mínimo requerido: {formatCurrency(calculations.minInitialAmount)}
                </p>
              </div>

              <div>
                <Label>Tasa (%)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="Ej. 30"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {categoryConfig
                    ? `Tasa mínima para ${categoryConfig.label}: ${categoryConfig.minRate}%`
                    : "Seleccione una categoría para ver la tasa mínima"}
                </p>
              </div>

              <div>
                <Label>Cantidad de cuotas</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={installments}
                  onChange={(e) => setInstallments(e.target.value)}
                  placeholder="Ej. 12"
                />
                <p className="mt-1 text-xs text-gray-500">
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
              <div className="mb-4 rounded-2xl bg-black p-6 text-white">
                <p className="text-sm text-gray-300">Cuota mensual</p>
                <p className="text-3xl font-bold">
                  {isValid ? formatCurrency(calculations.monthlyPayment) : "$0.00"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <Item label="Cantidad de cuotas" value={installments || "-"} />
                <Item
                  label="Monto mínimo de inicial"
                  value={formatCurrency(calculations.minInitialAmount)}
                />
                <Item
                  label="Porcentaje de inicial"
                  value={formatPercent(calculations.initialPercentage)}
                />
                <Item label="Monto financiado" value={formatCurrency(calculations.financedAmount)} />
                <Item label="Interés total" value={formatCurrency(calculations.totalInterest)} />
                <Item label="Total a pagar" value={formatCurrency(calculations.totalToPay)} />
                <Item label="IVA (16%)" value={formatCurrency(calculations.ivaAmount)} />
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