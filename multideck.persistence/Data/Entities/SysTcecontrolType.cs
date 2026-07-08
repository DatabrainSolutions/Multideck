using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTcecontrolType
{
    public string TcecontrolTypeCode { get; set; } = null!;

    public string TcecontrolTypeName { get; set; } = null!;

    public string? TcecontrolTypeDescription { get; set; }

    public bool TcecontrolTypeIsActive { get; set; }

    public int TcecontrolTypeSortOrder { get; set; }

    public virtual ICollection<TceCountryControlRule> TceCountryControlRules { get; set; } = new List<TceCountryControlRule>();

    public virtual ICollection<TceProductControlRule> TceProductControlRules { get; set; } = new List<TceProductControlRule>();
}
