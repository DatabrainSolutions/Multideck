using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmsexceptionType
{
    public string WmsexceptionTypeCode { get; set; } = null!;

    public string WmsexceptionTypeName { get; set; } = null!;

    public string? WmsexceptionTypeDescription { get; set; }

    public string WmsexceptionTypeDefaultSeverityCode { get; set; } = null!;

    public bool WmsexceptionTypeIsActive { get; set; }

    public int WmsexceptionTypeSortOrder { get; set; }

    public virtual ICollection<WmsException> WmsExceptions { get; set; } = new List<WmsException>();

    public virtual ICollection<WmsReceiptDiscrepancy> WmsReceiptDiscrepancies { get; set; } = new List<WmsReceiptDiscrepancy>();
}
