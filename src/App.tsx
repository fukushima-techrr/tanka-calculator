import { useState, useMemo, useRef, useCallback } from 'react';

/**
 * 端数処理：10円未満切り捨て
 * 負の値の場合は絶対値に対して切り捨て後、符号を維持
 */
const truncate10 = (amount: number): number => {
  if (amount >= 0) {
    return Math.floor(amount / 10) * 10;
  }
  return -(Math.floor(Math.abs(amount) / 10) * 10);
};

/** 数値を3桁カンマ区切りにフォーマット */
const formatNumber = (n: number): string => {
  return n.toLocaleString('ja-JP');
};

/** 単価ごとの計算結果 */
interface CalcResult {
  hourlyRateOver: number;
  hourlyRateUnder: number;
  excessHours: number;
  shortHours: number;
  excessAmount: number;
  deductionAmount: number;
  adjustmentAmount: number;
  billingBeforeTax: number;
  taxAmount: number;
  billingAfterTax: number;
  isWithinRange: boolean;
  /** 入力が税込の場合、逆算した税別の月額単価 */
  baseRateBeforeTax: number;
}

/** 単価計算ロジック */
const calculate = (
  inputRate: number, lower: number, upper: number, actual: number, tax: number, isTaxIncluded: boolean
): CalcResult | null => {
  if (inputRate === 0 || lower === 0 || upper === 0) return null;

  // 税込入力の場合、税別金額を逆算
  const baseRate = isTaxIncluded
    ? Math.round(inputRate / (1 + tax / 100))
    : inputRate;

  const hourlyRateOver = baseRate / upper;
  const hourlyRateUnder = baseRate / lower;

  let excessHours = 0;
  let shortHours = 0;
  if (actual > upper) {
    excessHours = actual - upper;
  } else if (actual < lower) {
    shortHours = lower - actual;
  }

  // 超過・控除金額のみ10円未満切り捨て
  const excessAmount = truncate10(hourlyRateOver * excessHours);
  const deductionAmount = truncate10(-(hourlyRateUnder * shortHours));
  const adjustmentAmount = excessAmount + deductionAmount;
  const billingBeforeTax = baseRate + adjustmentAmount;
  const taxAmount = Math.floor(billingBeforeTax * (tax / 100));
  const billingAfterTax = billingBeforeTax + taxAmount;

  return {
    hourlyRateOver, hourlyRateUnder,
    excessHours, shortHours,
    excessAmount, deductionAmount, adjustmentAmount,
    billingBeforeTax, taxAmount, billingAfterTax,
    isWithinRange: actual >= lower && actual <= upper,
    baseRateBeforeTax: baseRate,
  };
};

/** 税込/税別トグル */
const TaxToggle: React.FC<{
  value: boolean;
  onChange: (v: boolean) => void;
  color: 'indigo' | 'emerald';
}> = ({ value, onChange, color }) => {
  const activeClass = color === 'indigo'
    ? 'bg-indigo-600 text-white'
    : 'bg-emerald-600 text-white';
  const inactiveClass = 'text-slate-500 hover:text-slate-700';

  return (
    <div className="inline-flex rounded-md border border-slate-200 text-xs overflow-hidden">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`px-2.5 py-1 font-medium transition-colors ${!value ? activeClass : inactiveClass}`}
      >
        税別
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`px-2.5 py-1 font-medium transition-colors ${value ? activeClass : inactiveClass}`}
      >
        税込
      </button>
    </div>
  );
};

/** 計算結果の表示コンポーネント */
const ResultSection: React.FC<{
  result: CalcResult;
  actual: number;
  lower: number;
  upper: number;
  taxRate: string;
  color: 'indigo' | 'emerald';
  isTaxIncluded: boolean;
  inputRate: number;
}> = ({ result, actual, lower, upper, taxRate, color, isTaxIncluded, inputRate }) => {
  const bgClass = color === 'indigo' ? 'bg-indigo-50 border-indigo-100' : 'bg-emerald-50 border-emerald-100';
  const textClass = color === 'indigo' ? 'text-indigo-700' : 'text-emerald-700';

  return (
    <div className="space-y-2">
      {/* 税込入力の場合、逆算した税別単価を表示 */}
      {isTaxIncluded && (
        <Row
          label={<>税別月額 <span className="text-[10px] text-slate-400">({formatNumber(inputRate)}÷{1 + Number(taxRate) / 100})</span></>}
          value={`${formatNumber(result.baseRateBeforeTax)}円`}
        />
      )}
      <Row label="時間単価（超過）" value={`${formatNumber(Math.round(result.hourlyRateOver))}円/h`} />
      <Row label="時間単価（控除）" value={`${formatNumber(Math.round(result.hourlyRateUnder))}円/h`} />

      {result.excessHours > 0 && (
        <Row
          label={<>超過 <span className="text-[11px] text-slate-400">({actual} - {upper} = {result.excessHours}h)</span></>}
          value={`+${formatNumber(result.excessAmount)}円`}
          valueClass="text-green-600"
        />
      )}
      {result.shortHours > 0 && (
        <Row
          label={<>控除 <span className="text-[11px] text-slate-400">({lower} - {actual} = {result.shortHours}h)</span></>}
          value={`${formatNumber(result.deductionAmount)}円`}
          valueClass="text-red-600"
        />
      )}
      {result.isWithinRange && (
        <Row label="超過/控除" value="なし" valueClass="text-slate-400" />
      )}

      <Row label="税別" value={`${formatNumber(result.billingBeforeTax)}円`} bold />
      <Row label={`消費税(${taxRate}%)`} value={`${formatNumber(result.taxAmount)}円`} />

      <div className={`flex justify-between items-center py-2.5 px-3 rounded-lg border ${bgClass} mt-1`}>
        <span className={`text-xs font-semibold ${textClass}`}>税込</span>
        <span className={`text-lg font-mono font-bold ${textClass}`}>
          {formatNumber(result.billingAfterTax)}円
        </span>
      </div>
    </div>
  );
};

/** 行コンポーネント */
const Row: React.FC<{
  label: React.ReactNode;
  value: string;
  valueClass?: string;
  bold?: boolean;
}> = ({ label, value, valueClass = 'text-slate-800', bold }) => (
  <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
    <span className="text-xs text-slate-600">{label}</span>
    <span className={`text-xs font-mono ${bold ? 'font-semibold text-sm' : 'font-medium'} ${valueClass}`}>
      {value}
    </span>
  </div>
);

/** カンマ付き数値入力コンポーネント */
const CommaInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  className?: string;
}> = ({ value, onChange, className }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // 表示用：カンマ付き
  const displayValue = isFocused ? value : formatNumber(Number(value) || 0);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // 数字のみ許可（カンマは除去）
    const raw = e.target.value.replace(/,/g, '').replace(/[^0-9]/g, '');
    onChange(raw);
  }, [onChange]);

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      className={className}
    />
  );
};

function App() {
  // 共通入力
  const [actualHours, setActualHours] = useState<string>('170');
  const [taxRate, setTaxRate] = useState<string>('10');

  // 受注側
  const [orderRate, setOrderRate] = useState<string>('800000');
  const [orderLower, setOrderLower] = useState<string>('140');
  const [orderUpper, setOrderUpper] = useState<string>('180');
  const [orderTaxIncluded, setOrderTaxIncluded] = useState(false);

  // 支払い側
  const [payRate, setPayRate] = useState<string>('600000');
  const [payLower, setPayLower] = useState<string>('140');
  const [payUpper, setPayUpper] = useState<string>('180');
  const [payTaxIncluded, setPayTaxIncluded] = useState(false);

  const actual = Number(actualHours) || 0;
  const tax = Number(taxRate) || 0;

  // 計算
  const orderResult = useMemo(() =>
    calculate(Number(orderRate) || 0, Number(orderLower) || 0, Number(orderUpper) || 0, actual, tax, orderTaxIncluded),
    [orderRate, orderLower, orderUpper, actual, tax, orderTaxIncluded]
  );
  const payResult = useMemo(() =>
    calculate(Number(payRate) || 0, Number(payLower) || 0, Number(payUpper) || 0, actual, tax, payTaxIncluded),
    [payRate, payLower, payUpper, actual, tax, payTaxIncluded]
  );

  // 粗利（受注税別 - 支払い税別）
  const grossProfit = orderResult && payResult
    ? orderResult.billingBeforeTax - payResult.billingBeforeTax
    : null;

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-800 mb-5 text-center">
          単価計算
        </h1>

        {/* 共通入力 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">実稼働時間（h）</label>
              <input
                type="number"
                value={actualHours}
                onChange={(e) => setActualHours(e.target.value)}
                step="0.1"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-right text-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">消費税率（%）</label>
              <input
                type="number"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-right text-lg"
              />
            </div>
          </div>
        </div>

        {/* 受注・支払い 2列 */}
        <div className="grid grid-cols-2 gap-4">
          {/* 受注 */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-indigo-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-indigo-600">受注</h2>
                <TaxToggle value={orderTaxIncluded} onChange={setOrderTaxIncluded} color="indigo" />
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    月額単価（{orderTaxIncluded ? '税込' : '税別'}・円）
                  </label>
                  <CommaInput
                    value={orderRate}
                    onChange={setOrderRate}
                    className="w-full px-2 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-right text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">基準時間（h）</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={orderLower}
                      onChange={(e) => setOrderLower(e.target.value)}
                      className="w-0 flex-1 min-w-0 px-1 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-right text-sm"
                    />
                    <span className="text-slate-400 text-xs">〜</span>
                    <input
                      type="number"
                      value={orderUpper}
                      onChange={(e) => setOrderUpper(e.target.value)}
                      className="w-0 flex-1 min-w-0 px-1 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-right text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {orderResult && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <ResultSection
                  result={orderResult}
                  actual={actual}
                  lower={Number(orderLower) || 0}
                  upper={Number(orderUpper) || 0}
                  taxRate={taxRate}
                  color="indigo"
                  isTaxIncluded={orderTaxIncluded}
                  inputRate={Number(orderRate) || 0}
                />
              </div>
            )}
          </div>

          {/* 支払い */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-emerald-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-emerald-600">支払い</h2>
                <TaxToggle value={payTaxIncluded} onChange={setPayTaxIncluded} color="emerald" />
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    月額単価（{payTaxIncluded ? '税込' : '税別'}・円）
                  </label>
                  <CommaInput
                    value={payRate}
                    onChange={setPayRate}
                    className="w-full px-2 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-right text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">基準時間（h）</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={payLower}
                      onChange={(e) => setPayLower(e.target.value)}
                      className="w-0 flex-1 min-w-0 px-1 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-right text-sm"
                    />
                    <span className="text-slate-400 text-xs">〜</span>
                    <input
                      type="number"
                      value={payUpper}
                      onChange={(e) => setPayUpper(e.target.value)}
                      className="w-0 flex-1 min-w-0 px-1 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-right text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {payResult && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <ResultSection
                  result={payResult}
                  actual={actual}
                  lower={Number(payLower) || 0}
                  upper={Number(payUpper) || 0}
                  taxRate={taxRate}
                  color="emerald"
                  isTaxIncluded={payTaxIncluded}
                  inputRate={Number(payRate) || 0}
                />
              </div>
            )}
          </div>
        </div>

        {/* 粗利 */}
        {grossProfit !== null && (
          <div className="mt-5 bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-700">粗利（税別）</span>
              <span className={`text-xl font-mono font-bold ${grossProfit >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
                {formatNumber(grossProfit)}円
              </span>
            </div>
          </div>
        )}

        <p className="text-xs text-slate-400 mt-4 text-center">
          ※ 金額はすべて10円未満切り捨て
        </p>
      </div>
    </div>
  );
}

export default App;
