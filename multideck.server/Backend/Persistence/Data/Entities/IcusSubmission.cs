using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class IcusSubmission
{
    public Guid IcussId { get; set; }

    public Guid? IcussApiConnectionId { get; set; }

    public Guid? IcussCustomsId { get; set; }

    public string? IcussJurisdictionCode { get; set; }

    public string IcussDeclarationKind { get; set; } = null!;

    public Guid? IcussCdsid { get; set; }

    public Guid? IcussT1id { get; set; }

    public string IcussStatus { get; set; } = null!;

    public string? IcussIdempotencyKey { get; set; }

    public string? IcussICustomsDeclarationId { get; set; }

    public string? IcussICustomsSubmissionId { get; set; }

    public string? IcussHmrcsubmissionId { get; set; }

    public string? IcussMrn { get; set; }

    public string? IcussLrn { get; set; }

    public string IcussRequestMethod { get; set; } = null!;

    public string? IcussRequestPath { get; set; }

    public string IcussRequestHeadersJson { get; set; } = null!;

    public string IcussRequestPayloadJson { get; set; } = null!;

    public int? IcussResponseStatusCode { get; set; }

    public string IcussResponseHeadersJson { get; set; } = null!;

    public string IcussResponsePayloadJson { get; set; } = null!;

    public string? IcussErrorCode { get; set; }

    public string? IcussErrorMessage { get; set; }

    public int IcussAttemptCount { get; set; }

    public DateTime? IcussNextRetryAt { get; set; }

    public DateTime? IcussSubmittedAt { get; set; }

    public DateTime? IcussAcknowledgedAt { get; set; }

    public DateTime? IcussCompletedAt { get; set; }

    public DateTime IcussCreatedAt { get; set; }

    public Guid? IcussCreatedBy { get; set; }

    public DateTime IcussUpdatedAt { get; set; }

    public Guid? IcussUpdatedBy { get; set; }

    public virtual ICollection<IcusSubmissionEvent> IcusSubmissionEvents { get; set; } = new List<IcusSubmissionEvent>();

    public virtual IcusApiConnection? IcussApiConnection { get; set; }

    public virtual CdsDeclaration? IcussCds { get; set; }

    public virtual CustomsDeclaration? IcussCustoms { get; set; }

    public virtual SysCustomsDeclarationKind IcussDeclarationKindNavigation { get; set; } = null!;

    public virtual SysCustomsJurisdiction? IcussJurisdictionCodeNavigation { get; set; }

    public virtual SysCustomsSubmissionStatus IcussStatusNavigation { get; set; } = null!;

    public virtual T1Declaration? IcussT1 { get; set; }
}
