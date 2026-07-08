using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlClause
{
    public Guid BlclId { get; set; }

    public Guid BlclBlId { get; set; }

    public string BlclClauseType { get; set; } = null!;

    public string? BlclTitle { get; set; }

    public string BlclText { get; set; } = null!;

    public bool BlclIsPrinted { get; set; }

    public int BlclSequence { get; set; }

    public virtual BlHeader BlclBl { get; set; } = null!;
}
