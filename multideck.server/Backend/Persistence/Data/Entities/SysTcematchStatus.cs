using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTcematchStatus
{
    public string TcematchStatusCode { get; set; } = null!;

    public string TcematchStatusName { get; set; } = null!;

    public string? TcematchStatusDescription { get; set; }

    public bool TcematchStatusIsOpen { get; set; }

    public bool TcematchStatusIsBlocking { get; set; }

    public bool TcematchStatusIsActive { get; set; }

    public int TcematchStatusSortOrder { get; set; }

    public virtual ICollection<TceScreeningMatch> TceScreeningMatches { get; set; } = new List<TceScreeningMatch>();
}
