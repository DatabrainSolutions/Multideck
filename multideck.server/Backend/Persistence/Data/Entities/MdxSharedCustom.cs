using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MdxSharedCustom
{
    public Guid MdxcustomsId { get; set; }

    public Guid MdxcustomsSharedJobId { get; set; }

    public string? MdxcustomsLocalDeclarationTable { get; set; }

    public Guid? MdxcustomsLocalDeclarationId { get; set; }

    public string? MdxcustomsRemoteDeclarationId { get; set; }

    public string MdxcustomsStatusCode { get; set; } = null!;

    public string? MdxcustomsJurisdictionCode { get; set; }

    public string? MdxcustomsDeclarationKind { get; set; }

    public string? MdxcustomsDeclarationDirection { get; set; }

    public string? MdxcustomsDeclarationStatus { get; set; }

    public string? MdxcustomsLrn { get; set; }

    public string? MdxcustomsMrn { get; set; }

    public string? MdxcustomsDucr { get; set; }

    public string? MdxcustomsMucr { get; set; }

    public string? MdxcustomsCustomsOfficeCode { get; set; }

    public DateTime? MdxcustomsAcceptedAt { get; set; }

    public DateTime? MdxcustomsReleasedAt { get; set; }

    public DateTime? MdxcustomsHeldAt { get; set; }

    public string? MdxcustomsErrorSummary { get; set; }

    public string MdxcustomsSummaryJson { get; set; } = null!;

    public bool MdxcustomsRequiresReview { get; set; }

    public DateTime MdxcustomsUpdatedAt { get; set; }

    public virtual SysCustomsJurisdiction? MdxcustomsJurisdictionCodeNavigation { get; set; }

    public virtual MdxSharedJob MdxcustomsSharedJob { get; set; } = null!;

    public virtual SysMdxrecordStatus MdxcustomsStatusCodeNavigation { get; set; } = null!;
}
