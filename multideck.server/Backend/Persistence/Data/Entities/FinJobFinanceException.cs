using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinJobFinanceException
{
    public Guid FinjobExId { get; set; }

    public Guid? FinjobExJobId { get; set; }

    public string? FinjobExSourceTable { get; set; }

    public Guid? FinjobExSourceId { get; set; }

    public string FinjobExExceptionTypeCode { get; set; } = null!;

    public string FinjobExSeverityCode { get; set; } = null!;

    public string FinjobExStatusCode { get; set; } = null!;

    public string FinjobExTitle { get; set; } = null!;

    public string? FinjobExDescription { get; set; }

    public Guid? FinjobExAssignedUserId { get; set; }

    public DateTime FinjobExCreatedAt { get; set; }

    public DateTime? FinjobExResolvedAt { get; set; }

    public virtual CmpUser? FinjobExAssignedUser { get; set; }

    public virtual JobHeader? FinjobExJob { get; set; }

    public virtual SysFinanceInsightSeverity FinjobExSeverityCodeNavigation { get; set; } = null!;
}
