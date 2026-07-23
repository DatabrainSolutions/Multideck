using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTcescreeningStatus
{
    public string TcescreeningStatusCode { get; set; } = null!;

    public string TcescreeningStatusName { get; set; } = null!;

    public string? TcescreeningStatusDescription { get; set; }

    public bool TcescreeningStatusIsOpen { get; set; }

    public bool TcescreeningStatusIsBlocking { get; set; }

    public bool TcescreeningStatusIsActive { get; set; }

    public int TcescreeningStatusSortOrder { get; set; }

    public virtual ICollection<TceOwnershipCheck> TceOwnershipChecks { get; set; } = new List<TceOwnershipCheck>();

    public virtual ICollection<TceScreeningRun> TceScreeningRuns { get; set; } = new List<TceScreeningRun>();

    public virtual ICollection<TceScreeningSubject> TceScreeningSubjects { get; set; } = new List<TceScreeningSubject>();
}
