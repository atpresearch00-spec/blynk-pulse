export type Metric={label:string;unit:string;visible:boolean};

// Owner-confirmed meaning of V0 for this project. These are labels, not a
// sensor conversion: the raw Blynk value must remain unchanged.
export function metricForPin(pin:string,value:unknown):Metric{
  const m=value&&typeof value==='object'?value as Record<string,unknown>:{};
  const label=typeof m.label==='string'?m.label.slice(0,60):pin.toUpperCase();
  const unit=typeof m.unit==='string'?m.unit.slice(0,12):'';
  const defaults:Record<string,string>={v0:'Temperature',v5:'Defrost duration',v8:'Defrost status'};
  return {
    label:defaults[pin]&&(!label.trim()||label.toUpperCase()===pin.toUpperCase())?defaults[pin]:label,
    unit:!unit.trim()?(pin==='v0'?'°F':pin==='v5'?'min':unit):unit,
    visible:typeof m.visible==='boolean'?m.visible:true,
  };
}
