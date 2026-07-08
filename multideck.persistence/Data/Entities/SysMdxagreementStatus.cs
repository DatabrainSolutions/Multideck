using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysMdxagreementStatus
{
    public string MdxagreementStatusCode { get; set; } = null!;

    public string MdxagreementStatusName { get; set; } = null!;

    public string? MdxagreementStatusDescription { get; set; }

    public bool MdxagreementStatusIsFinal { get; set; }

    public int MdxagreementStatusSortOrder { get; set; }

    public bool MdxagreementStatusIsActive { get; set; }

    public DateTime MdxagreementStatusCreatedAt { get; set; }

    public virtual ICollection<MdxShareAgreement> MdxShareAgreements { get; set; } = new List<MdxShareAgreement>();
}
