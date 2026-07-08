using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class T1DataElement
{
    public Guid T1deId { get; set; }

    public Guid T1deT1id { get; set; }

    public Guid? T1deT1itemId { get; set; }

    public string T1deMessageElement { get; set; } = null!;

    public string T1deLevel { get; set; } = null!;

    public string? T1deValueText { get; set; }

    public string T1deValueJson { get; set; } = null!;

    public string? T1deSource { get; set; }

    public string? T1deValidationStatus { get; set; }

    public DateTime T1deCreatedAt { get; set; }

    public virtual T1Declaration T1deT1 { get; set; } = null!;

    public virtual T1Item? T1deT1item { get; set; }
}
