using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceOwnershipCheck
{
    public Guid TceownerCheckId { get; set; }

    public Guid? TceownerCheckSubjectId { get; set; }

    public Guid? TceownerCheckOrgId { get; set; }

    public string TceownerCheckCheckTypeCode { get; set; } = null!;

    public string TceownerCheckStatusCode { get; set; } = null!;

    public decimal TceownerCheckThresholdPercent { get; set; }

    public decimal TceownerCheckMaxSanctionedOwnershipPercent { get; set; }

    public bool TceownerCheckControlConcern { get; set; }

    public string? TceownerCheckSourceSummary { get; set; }

    public string TceownerCheckEvidenceJson { get; set; } = null!;

    public DateTime TceownerCheckCheckedAt { get; set; }

    public Guid? TceownerCheckCheckedBy { get; set; }

    public virtual CmpUser? TceownerCheckCheckedByNavigation { get; set; }

    public virtual OrgMaster? TceownerCheckOrg { get; set; }

    public virtual SysTcescreeningStatus TceownerCheckStatusCodeNavigation { get; set; } = null!;

    public virtual TceScreeningSubject? TceownerCheckSubject { get; set; }
}
