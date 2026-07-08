using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsDocument
{
    public Guid CdsdId { get; set; }

    public Guid CdsdCdsid { get; set; }

    public Guid? CdsdCdsitemId { get; set; }

    public string? CdsdDocumentRole { get; set; }

    public string? CdsdDocumentCode { get; set; }

    public string? CdsdDocumentStatusCode { get; set; }

    public string? CdsdDocumentReference { get; set; }

    public int? CdsdDocumentLineItemNumber { get; set; }

    public string? CdsdIssuingAuthority { get; set; }

    public DateOnly? CdsdIssueDate { get; set; }

    public DateOnly? CdsdExpiryDate { get; set; }

    public string CdsdDocumentJson { get; set; } = null!;

    public DateTime CdsdCreatedAt { get; set; }

    public Guid? CdsdJobDocumentId { get; set; }

    public virtual CdsDeclaration CdsdCds { get; set; } = null!;

    public virtual CdsItem? CdsdCdsitem { get; set; }

    public virtual SysCustomsDocumentRole? CdsdDocumentRoleNavigation { get; set; }

    public virtual JobDocument? CdsdJobDocument { get; set; }
}
