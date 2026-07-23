using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysMdxreviewStatus
{
    public string MdxreviewStatusCode { get; set; } = null!;

    public string MdxreviewStatusName { get; set; } = null!;

    public string? MdxreviewStatusDescription { get; set; }

    public bool MdxreviewStatusIsFinal { get; set; }

    public int MdxreviewStatusSortOrder { get; set; }

    public bool MdxreviewStatusIsActive { get; set; }

    public DateTime MdxreviewStatusCreatedAt { get; set; }

    public virtual ICollection<MdxInboundReviewItem> MdxInboundReviewItems { get; set; } = new List<MdxInboundReviewItem>();
}
