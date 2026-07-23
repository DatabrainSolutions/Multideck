using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class T1Seal
{
    public Guid T1sId { get; set; }

    public Guid T1sT1id { get; set; }

    public string T1sSealNumber { get; set; } = null!;

    public string? T1sSealType { get; set; }

    public DateTime T1sCreatedAt { get; set; }

    public virtual T1Declaration T1sT1 { get; set; } = null!;
}
