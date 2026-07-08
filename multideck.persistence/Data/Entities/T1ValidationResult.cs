using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class T1ValidationResult
{
    public Guid T1vrId { get; set; }

    public Guid T1vrT1id { get; set; }

    public Guid? T1vrT1itemId { get; set; }

    public string T1vrValidationScope { get; set; } = null!;

    public string? T1vrValidationSource { get; set; }

    public string T1vrResult { get; set; } = null!;

    public string? T1vrCode { get; set; }

    public string? T1vrMessage { get; set; }

    public string T1vrDetail { get; set; } = null!;

    public DateTime T1vrValidatedAt { get; set; }

    public Guid? T1vrValidatedBy { get; set; }

    public virtual T1Declaration T1vrT1 { get; set; } = null!;

    public virtual T1Item? T1vrT1item { get; set; }
}
