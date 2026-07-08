using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTcecaseStatus
{
    public string TcecaseStatusCode { get; set; } = null!;

    public string TcecaseStatusName { get; set; } = null!;

    public string? TcecaseStatusDescription { get; set; }

    public bool TcecaseStatusIsOpen { get; set; }

    public bool TcecaseStatusIsBlocking { get; set; }

    public bool TcecaseStatusIsActive { get; set; }

    public int TcecaseStatusSortOrder { get; set; }

    public virtual ICollection<TceCaseDecision> TceCaseDecisions { get; set; } = new List<TceCaseDecision>();

    public virtual ICollection<TceComplianceCase> TceComplianceCases { get; set; } = new List<TceComplianceCase>();
}
