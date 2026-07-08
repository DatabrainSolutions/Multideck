using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysEdipayloadStorageType
{
    public string EdipayloadStoreCode { get; set; } = null!;

    public string EdipayloadStoreName { get; set; } = null!;

    public string? EdipayloadStoreDescription { get; set; }

    public bool EdipayloadStoreIsDatabaseStored { get; set; }

    public bool EdipayloadStoreIsActive { get; set; }

    public int EdipayloadStoreSortOrder { get; set; }

    public virtual ICollection<EdiBatch> EdiBatches { get; set; } = new List<EdiBatch>();

    public virtual ICollection<EdiInboundQueue> EdiInboundQueues { get; set; } = new List<EdiInboundQueue>();

    public virtual ICollection<EdiMessage> EdiMessages { get; set; } = new List<EdiMessage>();

    public virtual ICollection<EdiTestCase> EdiTestCases { get; set; } = new List<EdiTestCase>();
}
