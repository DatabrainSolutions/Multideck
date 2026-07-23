using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysPortalUploadStatus
{
    public string PortalUploadStatusCode { get; set; } = null!;

    public string PortalUploadStatusName { get; set; } = null!;

    public string? PortalUploadStatusDescription { get; set; }

    public bool PortalUploadStatusIsFinal { get; set; }

    public int PortalUploadStatusSortOrder { get; set; }

    public virtual ICollection<PortalFileUpload> PortalFileUploads { get; set; } = new List<PortalFileUpload>();
}
