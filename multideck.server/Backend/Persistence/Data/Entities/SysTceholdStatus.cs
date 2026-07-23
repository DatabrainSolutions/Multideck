using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTceholdStatus
{
    public string TceholdStatusCode { get; set; } = null!;

    public string TceholdStatusName { get; set; } = null!;

    public string? TceholdStatusDescription { get; set; }

    public bool TceholdStatusIsOpen { get; set; }

    public bool TceholdStatusIsBlocking { get; set; }

    public bool TceholdStatusIsActive { get; set; }

    public int TceholdStatusSortOrder { get; set; }

    public virtual ICollection<TceComplianceHold> TceComplianceHolds { get; set; } = new List<TceComplianceHold>();
}
