using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTcecheckStatus
{
    public string TcecheckStatusCode { get; set; } = null!;

    public string TcecheckStatusName { get; set; } = null!;

    public string? TcecheckStatusDescription { get; set; }

    public bool TcecheckStatusIsOpen { get; set; }

    public bool TcecheckStatusIsBlocking { get; set; }

    public bool TcecheckStatusIsFinal { get; set; }

    public bool TcecheckStatusIsActive { get; set; }

    public int TcecheckStatusSortOrder { get; set; }

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceComplianceChecklist> TceComplianceChecklists { get; set; } = new List<TceComplianceChecklist>();

    public virtual ICollection<TceReleaseGate> TceReleaseGates { get; set; } = new List<TceReleaseGate>();
}
