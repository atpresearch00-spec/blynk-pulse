export type Metric={label:string;unit:string;visible:boolean};

// Owner-confirmed meaning of V0 for this project. These are labels, not a
// sensor conversion: the raw Blynk value must remain unchanged.
export function metricForPin(pin:string,value:unknown):Metric{
  const m=value&&typeof value==='object'?value as Record<string,unknown>:{};
  const label=typeof m.label==='string'?m.label.slice(0,60):pin.toUpperCase();
  const unit=typeof m.unit==='string'?m.unit.slice(0,12):'';
  return {
    label:pin==='v0'&&(!label.trim()||label.toUpperCase()==='V0')?'Temperature':label,
    unit:pin==='v0'&&!unit.trim()?'°F':unit,
    visible:typeof m.visible==='boolean'?m.visible:true,
  };
}
