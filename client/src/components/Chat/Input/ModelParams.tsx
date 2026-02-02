import React, { memo, useState, useCallback, useMemo } from 'react';
import * as Ariakit from '@ariakit/react';
import { SlidersHorizontal, ChevronDown, RotateCcw } from 'lucide-react';
import type { TModelParameter } from 'librechat-data-provider';
import { useModelParams, useLocalize } from '~/hooks';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { cn } from '~/utils';

interface ParamItemProps {
  param: TModelParameter;
  value: unknown;
  onChange: (value: unknown) => void;
}

/** Render a boolean parameter as a switch */
function BooleanParamItem({ param, value, onChange }: ParamItemProps) {
  const isChecked = value === true;

  return (
    <Ariakit.MenuItem
      hideOnClick={false}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onChange(!isChecked);
      }}
      className={cn(
        'mb-1 flex items-center justify-between gap-2 rounded-lg px-2 py-2',
        'cursor-pointer bg-surface-secondary text-text-primary outline-none transition-colors',
        'hover:bg-surface-hover data-[active-item]:bg-surface-hover',
        isChecked && 'bg-surface-active',
      )}
    >
      <div className="flex flex-col">
        <span className="text-sm">{param.name}</span>
        {param.description && (
          <span className="text-xs text-text-secondary">{param.description}</span>
        )}
      </div>
      <div className="ml-auto flex items-center">
        <Ariakit.MenuItemCheck checked={isChecked} />
      </div>
    </Ariakit.MenuItem>
  );
}

/** Render an enum parameter as selectable options */
function EnumParamItem({ param, value, onChange }: ParamItemProps) {
  const options = param.schema.enum ?? [];
  const currentValue = value as string;

  return (
    <div className="mb-2 px-2">
      <div className="mb-1.5 text-xs font-medium text-text-secondary">{param.name}</div>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              'rounded-md px-2 py-1 text-xs transition-colors',
              currentValue === option
                ? 'bg-surface-active text-text-primary'
                : 'bg-surface-tertiary text-text-secondary hover:bg-surface-hover',
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Render a number parameter as a slider */
function NumberParamItem({ param, value, onChange }: ParamItemProps) {
  const min = param.schema.minimum ?? 0;
  const max = param.schema.maximum ?? 100;
  const currentValue = typeof value === 'number' ? value : (param.default_value as number) ?? min;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange],
  );

  return (
    <div className="mb-2 px-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">{param.name}</span>
        <span className="text-xs text-text-primary">{currentValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={currentValue}
        onChange={handleChange}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-surface-tertiary accent-green-500"
      />
      <div className="mt-0.5 flex justify-between text-xs text-text-secondary">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

/** Render a parameter based on its schema type */
function ParamItem({ param, value, onChange }: ParamItemProps) {
  const { schema } = param;

  if (schema.type === 'boolean') {
    return <BooleanParamItem param={param} value={value} onChange={onChange} />;
  }

  if (schema.enum && schema.enum.length > 0) {
    return <EnumParamItem param={param} value={value} onChange={onChange} />;
  }

  if (schema.type === 'number') {
    return <NumberParamItem param={param} value={value} onChange={onChange} />;
  }

  // Fallback for unknown types
  return null;
}

function ModelParams() {
  const localize = useLocalize();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const modelId = conversation?.model;

  const { parameters, values, updateParam, resetToDefaults, hasParameters, isLoading } =
    useModelParams({ modelId });

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const handleParamChange = useCallback(
    (name: string) => (value: unknown) => {
      updateParam(name, value);
    },
    [updateParam],
  );

  const handleReset = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resetToDefaults();
    },
    [resetToDefaults],
  );

  // Count how many parameters have non-default values
  const activeParamsCount = useMemo(() => {
    let count = 0;
    for (const param of parameters) {
      const currentValue = values[param.name];
      const defaultValue = param.default_value;
      if (currentValue !== undefined && currentValue !== defaultValue) {
        count++;
      }
    }
    return count;
  }, [parameters, values]);

  // Don't render if no parameters available
  if (!hasParameters || isLoading) {
    return null;
  }

  return (
    <Ariakit.MenuProvider open={isPopoverOpen} setOpen={setIsPopoverOpen}>
      <Ariakit.MenuButton
        className={cn(
          'group relative inline-flex items-center justify-center gap-1.5',
          'rounded-full border border-border-medium text-sm font-medium',
          'size-9 p-2 transition-all md:w-auto md:px-3 md:py-2',
          'bg-transparent shadow-sm hover:bg-surface-hover hover:shadow-md active:shadow-inner',
          activeParamsCount > 0 && 'border-green-600/40 bg-green-500/10 hover:bg-green-700/10',
        )}
      >
        <SlidersHorizontal className="icon-md text-text-primary" aria-hidden="true" />
        <span className="hidden truncate md:block">{localize('com_ui_parameters')}</span>
        {activeParamsCount > 0 && (
          <span className="ml-1 hidden rounded-full bg-green-500/20 px-1.5 py-0.5 text-xs text-green-600 md:block">
            {activeParamsCount}
          </span>
        )}
        <ChevronDown
          className={cn(
            'hidden h-4 w-4 text-text-secondary transition-transform duration-300 md:block',
            isPopoverOpen && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </Ariakit.MenuButton>

      <Ariakit.Menu
        gutter={4}
        className={cn(
          'animate-popover-top z-40 flex min-w-[280px] max-w-[320px] flex-col rounded-xl',
          'border border-border-light bg-surface-secondary shadow-lg',
        )}
        portal={true}
        unmountOnHide={true}
        hideOnInteractOutside={true}
        hideOnEscape={true}
      >
        <div className="px-2 py-1.5">
          {/* Header */}
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">
              {localize('com_ui_model_parameters')}
            </span>
            {activeParamsCount > 0 && (
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-text-secondary hover:bg-surface-hover"
                title={localize('com_ui_reset_to_defaults')}
              >
                <RotateCcw className="h-3 w-3" />
                <span>{localize('com_ui_reset')}</span>
              </button>
            )}
          </div>

          {/* Parameter Items */}
          {parameters.map((param) => (
            <ParamItem
              key={param.name}
              param={param}
              value={values[param.name]}
              onChange={handleParamChange(param.name)}
            />
          ))}
        </div>
      </Ariakit.Menu>
    </Ariakit.MenuProvider>
  );
}

export default memo(ModelParams);
