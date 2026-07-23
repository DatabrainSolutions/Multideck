using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTceftacheckStatus
{
    public string TceftacheckStatusCode { get; set; } = null!;

    public string TceftacheckStatusName { get; set; } = null!;

    public string? TceftacheckStatusDescription { get; set; }

    public bool TceftacheckStatusIsFinal { get; set; }

    public bool TceftacheckStatusIsActive { get; set; }

    public int TceftacheckStatusSortOrder { get; set; }

    public virtual ICollection<TcePreferenceClaim> TcePreferenceClaims { get; set; } = new List<TcePreferenceClaim>();
}
