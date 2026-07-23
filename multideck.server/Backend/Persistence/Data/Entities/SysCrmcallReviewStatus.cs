using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmcallReviewStatus
{
    public string CrmcallReviewStatusCode { get; set; } = null!;

    public string CrmcallReviewStatusName { get; set; } = null!;

    public string? CrmcallReviewStatusDescription { get; set; }

    public bool CrmcallReviewStatusIsClosed { get; set; }

    public bool CrmcallReviewStatusIsActive { get; set; }

    public int CrmcallReviewStatusSortOrder { get; set; }

    public virtual ICollection<CrmCallReview> CrmCallReviews { get; set; } = new List<CrmCallReview>();
}
