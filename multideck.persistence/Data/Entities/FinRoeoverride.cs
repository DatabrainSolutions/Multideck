using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinRoeoverride
{
    public Guid FinroeovId { get; set; }

    public Guid? FinroeovChargeRoeid { get; set; }

    public string? FinroeovSourceTable { get; set; }

    public Guid? FinroeovSourceId { get; set; }

    public decimal FinroeovOldRate { get; set; }

    public decimal FinroeovNewRate { get; set; }

    public string FinroeovReason { get; set; } = null!;

    public string FinroeovStatusCode { get; set; } = null!;

    public Guid? FinroeovAuthorisationRequestId { get; set; }

    public DateTime? FinroeovApprovedAt { get; set; }

    public Guid? FinroeovApprovedBy { get; set; }

    public DateTime FinroeovCreatedAt { get; set; }

    public Guid? FinroeovCreatedBy { get; set; }

    public virtual CmpUser? FinroeovApprovedByNavigation { get; set; }

    public virtual FinAuthorisationRequest? FinroeovAuthorisationRequest { get; set; }

    public virtual FinChargeRoeapplication? FinroeovChargeRoe { get; set; }

    public virtual CmpUser? FinroeovCreatedByNavigation { get; set; }
}
