using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinDocumentApproval
{
    public Guid FindocApprId { get; set; }

    public Guid FindocApprDocumentId { get; set; }

    public Guid? FindocApprAuthorisationRequestId { get; set; }

    public string FindocApprStatusCode { get; set; } = null!;

    public DateTime FindocApprRequestedAt { get; set; }

    public Guid? FindocApprRequestedBy { get; set; }

    public DateTime? FindocApprApprovedAt { get; set; }

    public Guid? FindocApprApprovedBy { get; set; }

    public string? FindocApprComments { get; set; }

    public virtual CmpUser? FindocApprApprovedByNavigation { get; set; }

    public virtual FinAuthorisationRequest? FindocApprAuthorisationRequest { get; set; }

    public virtual FinDocument FindocApprDocument { get; set; } = null!;

    public virtual CmpUser? FindocApprRequestedByNavigation { get; set; }
}
