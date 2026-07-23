using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinNumberSequence
{
    public Guid FinseqId { get; set; }

    public string FinseqCode { get; set; } = null!;

    public string FinseqName { get; set; } = null!;

    public Guid? FinseqLegalEntityId { get; set; }

    public Guid? FinseqOrgOfficeId { get; set; }

    public string? FinseqDocumentTypeCode { get; set; }

    public string FinseqPrefix { get; set; } = null!;

    public string FinseqSuffix { get; set; } = null!;

    public long FinseqNextNumber { get; set; }

    public int FinseqPaddingLength { get; set; }

    public string FinseqResetPeriodCode { get; set; } = null!;

    public bool FinseqIsActive { get; set; }

    public DateTime FinseqCreatedAt { get; set; }

    public virtual SysFinanceDocumentType? FinseqDocumentTypeCodeNavigation { get; set; }

    public virtual CmpLegalEntity? FinseqLegalEntity { get; set; }

    public virtual CmpOffice? FinseqOrgOffice { get; set; }
}
