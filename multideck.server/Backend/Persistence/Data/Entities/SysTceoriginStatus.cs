using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTceoriginStatus
{
    public string TceoriginStatusCode { get; set; } = null!;

    public string TceoriginStatusName { get; set; } = null!;

    public string? TceoriginStatusDescription { get; set; }

    public bool TceoriginStatusIsFinal { get; set; }

    public bool TceoriginStatusIsActive { get; set; }

    public int TceoriginStatusSortOrder { get; set; }

    public virtual ICollection<TceOriginDeclaration> TceOriginDeclarations { get; set; } = new List<TceOriginDeclaration>();
}
