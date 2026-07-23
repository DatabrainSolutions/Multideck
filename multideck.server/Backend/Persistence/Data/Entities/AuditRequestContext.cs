using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AuditRequestContext
{
    public Guid AuditRequestId { get; set; }

    public string? AuditRequestRequestId { get; set; }

    public string? AuditRequestSessionId { get; set; }

    public string? AuditRequestCorrelationId { get; set; }

    public string AuditRequestActorTypeCode { get; set; } = null!;

    public Guid? AuditRequestUserId { get; set; }

    public Guid? AuditRequestAuthUserId { get; set; }

    public Guid? AuditRequestOrgOfficeId { get; set; }

    public Guid? AuditRequestLegalEntityId { get; set; }

    public Guid? AuditRequestBrandId { get; set; }

    public string? AuditRequestSourceApp { get; set; }

    public string? AuditRequestSourceModule { get; set; }

    public string? AuditRequestClientVersion { get; set; }

    public string? AuditRequestIphash { get; set; }

    public string? AuditRequestUserAgent { get; set; }

    public DateTime AuditRequestStartedAt { get; set; }

    public DateTime? AuditRequestEndedAt { get; set; }

    public string? AuditRequestOutcomeStatusCode { get; set; }

    public string AuditRequestMetadataJson { get; set; } = null!;

    public virtual ICollection<AuditEvent> AuditEvents { get; set; } = new List<AuditEvent>();

    public virtual SysAuditActorType AuditRequestActorTypeCodeNavigation { get; set; } = null!;

    public virtual CmpBrand? AuditRequestBrand { get; set; }

    public virtual CmpLegalEntity? AuditRequestLegalEntity { get; set; }

    public virtual CmpOffice? AuditRequestOrgOffice { get; set; }

    public virtual SysAuditOutcomeStatus? AuditRequestOutcomeStatusCodeNavigation { get; set; }

    public virtual CmpUser? AuditRequestUser { get; set; }
}
