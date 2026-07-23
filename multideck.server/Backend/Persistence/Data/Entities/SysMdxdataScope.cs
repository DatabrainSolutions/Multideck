using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysMdxdataScope
{
    public string MdxdataScopeCode { get; set; } = null!;

    public string MdxdataScopeName { get; set; } = null!;

    public string? MdxdataScopeDescription { get; set; }

    public bool MdxdataScopeDefaultRequiresReview { get; set; }

    public bool MdxdataScopeIsCommercial { get; set; }

    public int MdxdataScopeSortOrder { get; set; }

    public bool MdxdataScopeIsActive { get; set; }

    public DateTime MdxdataScopeCreatedAt { get; set; }

    public virtual ICollection<MdxConflictCase> MdxConflictCases { get; set; } = new List<MdxConflictCase>();

    public virtual ICollection<MdxDataChangeEvent> MdxDataChangeEvents { get; set; } = new List<MdxDataChangeEvent>();

    public virtual ICollection<MdxInboundReviewItem> MdxInboundReviewItems { get; set; } = new List<MdxInboundReviewItem>();

    public virtual ICollection<MdxShareAgreementScope> MdxShareAgreementScopes { get; set; } = new List<MdxShareAgreementScope>();
}
